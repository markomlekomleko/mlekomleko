import { scryptSync, timingSafeEqual, randomBytes } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { assertDomain, emailAddress, enumValue, requiredString } from './domain';
import { all, batch, first, type Row } from './sql';
import { audit } from './outbox';
export type StaffRole = 'owner' | 'manager' | 'driver' | 'finance';
export const actorContext = new AsyncLocalStorage<{ id?: string; role?: StaffRole }>();
export function hashStaffPassword(raw: unknown) {
  const password = requiredString(raw,'password',200);
  assertDomain(password.length >= 12,'PASSWORD_WEAK','Lozinka mora imati najmanje 12 znakova.',422);
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password,salt,64).toString('hex')}`;
}
export function verifyStaffPassword(raw: string, hash: string) {
  const [salt,saved] = hash.split(':');
  if (!salt || !saved) return false;
  const actual = scryptSync(raw,salt,64), expected = Buffer.from(saved,'hex');
  return expected.length === actual.length && timingSafeEqual(actual,expected);
}
export function authorizeStaff(role: StaffRole, request: Request) {
  const path = new URL(request.url).pathname;
  const read = request.method === 'GET';
  const allowed = role === 'owner' || path === '/api/admin/access'
    || (role === 'manager' && !path.startsWith('/api/admin/staff'))
    || (role === 'driver' && (/^\/api\/admin\/(deliveries|delivery-calendar|delivery-preview)(\/|$)/.test(path)))
    || (role === 'finance' && (/^\/api\/admin\/(integrations|fiscomm|refunds|payments|messages|commerce-readiness)(\/|$)/.test(path) || (read && /^\/api\/admin\/(orders|dashboard)(\/|$)/.test(path))));
  assertDomain(allowed,'ROLE_FORBIDDEN','Vaša uloga nema pristup ovom delu.',403);
}
export async function listStaff() { return all<Row>('SELECT id,email,full_name,role,is_active,version,created_at FROM admin_users ORDER BY full_name'); }
export async function saveStaff(input: Row) {
  const id = input.id ? requiredString(input.id,'id',100) : crypto.randomUUID();
  const before = await first<Row>('SELECT * FROM admin_users WHERE id = ?',id);
  const email = emailAddress(input.email ?? before?.email);
  const name = requiredString(input.fullName ?? before?.full_name,'fullName',160);
  const role = enumValue(input.role ?? before?.role,'role',['manager','driver','finance'] as const);
  const active = input.isActive === false ? 0 : 1;
  const passwordHash = input.password ? hashStaffPassword(input.password) : before?.password_hash;
  assertDomain(passwordHash,'PASSWORD_REQUIRED','Unesite početnu lozinku.',422);
  await batch([
    {sql:'INSERT INTO admin_users(id,email,full_name,password_hash,role,is_active) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,full_name=excluded.full_name,password_hash=excluded.password_hash,role=excluded.role,is_active=excluded.is_active,version=admin_users.version+1',bindings:[id,email,name,String(passwordHash),role,active]},
    {sql:'UPDATE admin_sessions SET revoked_at = ? WHERE admin_user_id = ?',bindings:[new Date().toISOString(),id]},
    audit('admin','admin-panel',before?'staff.updated':'staff.created','staff',id,null,{email,name,role,active}),
  ]);
  return { id,email,fullName:name,role,isActive:Boolean(active) };
}
