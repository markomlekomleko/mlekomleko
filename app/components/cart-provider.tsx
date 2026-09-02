"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { fetchJson, type CartItem } from "../lib/frontend";

const STORAGE_KEY = "mleko-i-mleko-cart-v2";

type CartContextValue = {
  items: CartItem[];
  ready: boolean;
  count: number;
  promoCode: string;
  setPromoCode: (value: string) => void;
  addItem: (item: Omit<CartItem, "key">) => void;
  updateItem: (key: string, changes: Partial<Omit<CartItem, "key">>) => void;
  removeItem: (key: string) => void;
  clearCart: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

function itemKey(item: Pick<CartItem, "productId" | "purchaseType" | "cadence">) {
  return `${item.productId}:${item.purchaseType}:${item.cadence ?? "once"}`;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [promoCode, setPromoCodeState] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      void (async () => {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        if (saved) {
          try {
            const parsed = JSON.parse(saved) as { items?: CartItem[]; promoCode?: string } | CartItem[];
            if (Array.isArray(parsed)) setItems(parsed);
            else {
              if (Array.isArray(parsed.items)) setItems(parsed.items);
              if (typeof parsed.promoCode === "string") setPromoCodeState(parsed.promoCode);
            }
          } catch {
            window.localStorage.removeItem(STORAGE_KEY);
          }
        }

        try {
          const recoveryId = new URLSearchParams(window.location.search).get("recover");
          if (recoveryId) {
            const recovered = await fetchJson<{ items: Array<Omit<CartItem, "key">>; promoCode?: string | null }>(`/api/cart/recovery?cartId=${encodeURIComponent(recoveryId)}`);
            setItems(recovered.items.map((item) => ({ ...item, key: itemKey(item) })));
            setPromoCodeState(recovered.promoCode ?? "");
          }
        } catch {
          // Neispravan link za oporavak ne sme da obriše postojeću lokalnu korpu.
        } finally {
          setReady(true);
        }
      })();
    });
  }, []);

  useEffect(() => {
    if (ready) window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ items, promoCode }));
  }, [items, promoCode, ready]);

  const setPromoCode = useCallback((value: string) => {
    setPromoCodeState(value.toUpperCase().replace(/\s+/g, "").slice(0, 40));
  }, []);

  const addItem = useCallback((newItem: Omit<CartItem, "key">) => {
    setItems((current) => {
      const key = itemKey(newItem);
      const existing = current.find((item) => item.key === key);
      if (existing) {
        return current.map((item) =>
          item.key === key
            ? { ...item, quantity: item.quantity + newItem.quantity }
            : item,
        );
      }
      return [...current, { ...newItem, key }];
    });
  }, []);

  const updateItem = useCallback(
    (key: string, changes: Partial<Omit<CartItem, "key">>) => {
      setItems((current) => {
        const source = current.find((item) => item.key === key);
        if (!source) return current;
        const updated = {
          ...source,
          ...changes,
          quantity: Math.max(1, Number(changes.quantity ?? source.quantity)),
        };
        const nextKey = itemKey(updated);
        const withoutSource = current.filter((item) => item.key !== key);
        const duplicate = withoutSource.find((item) => item.key === nextKey);
        if (duplicate) {
          return withoutSource.map((item) =>
            item.key === nextKey
              ? { ...item, quantity: item.quantity + updated.quantity }
              : item,
          );
        }
        return current.map((item) =>
          item.key === key ? { ...updated, key: nextKey } : item,
        );
      });
    },
    [],
  );

  const removeItem = useCallback((key: string) => {
    setItems((current) => current.filter((item) => item.key !== key));
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
    setPromoCodeState("");
  }, []);

  const value = useMemo(
    () => ({
      items,
      ready,
      count: items.reduce((sum, item) => sum + item.quantity, 0),
      promoCode,
      setPromoCode,
      addItem,
      updateItem,
      removeItem,
      clearCart,
    }),
    [items, promoCode, ready, addItem, updateItem, removeItem, clearCart, setPromoCode],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart mora biti korišćen unutar CartProvider-a.");
  return context;
}
