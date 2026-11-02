"""Create the handover guide from verified local browser captures (synthetic data only)."""
import os
from pathlib import Path
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle, Flowable
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import ImageReader

root=Path(__file__).resolve().parent.parent
font=Path(os.environ.get('REPORT_FONT_DIR','/Users/luka/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/libreoffice-headless/libreoffice/LibreOfficeDev.app/Contents/Resources/fonts/truetype'))
pdfmetrics.registerFont(TTFont('Guide',str(font/'DejaVuSans.ttf')))
pdfmetrics.registerFont(TTFont('GuideBold',str(font/'DejaVuSans-Bold.ttf')))
pdfmetrics.registerFontFamily('Guide',normal='Guide',bold='GuideBold',italic='Guide',boldItalic='GuideBold')
green=colors.HexColor('#244c3b'); muted=colors.HexColor('#65715f'); ink=colors.HexColor('#24372b')
styles=getSampleStyleSheet()
styles.add(ParagraphStyle(name='BodyGuide',fontName='Guide',fontSize=10.4,leading=15,textColor=ink,spaceAfter=9))
styles.add(ParagraphStyle(name='SmallGuide',parent=styles['BodyGuide'],fontSize=8.5,leading=12,textColor=muted))
styles.add(ParagraphStyle(name='TitleGuide',fontName='GuideBold',fontSize=26,leading=31,textColor=green,spaceAfter=16))
styles.add(ParagraphStyle(name='HeadingGuide',fontName='GuideBold',fontSize=19,leading=24,textColor=green,spaceAfter=14))
styles.add(ParagraphStyle(name='SubGuide',fontName='GuideBold',fontSize=12,leading=17,textColor=green,spaceBefore=10,spaceAfter=8))
story=[]
def p(text,style='BodyGuide'): story.append(Paragraph(text,styles[style]))
def title(text): p(text,'HeadingGuide')
def sub(text): p(text,'SubGuide')
def step(n,text): p(f'<b>{n:02d}</b>  {text}')
def page(): story.append(PageBreak())
class Screenshot(Flowable):
    def __init__(self,name,maxheight=300,crop=None):
        super().__init__(); self.image=ImageReader(str(root/'output/playwright'/name));self.iw,self.ih=self.image.getSize()
        self.crop=crop or (0,0,self.iw,self.ih)
        x,y,w,h=self.crop;self.scale=min(511/w,maxheight/h);self.width=w*self.scale;self.height=h*self.scale
    def draw(self):
        x,y,w,h=self.crop;c=self.canv;c.saveState();clip=c.beginPath();clip.rect(0,0,self.width,self.height);c.clipPath(clip,stroke=0)
        c.drawImage(self.image,-x*self.scale,(h-self.ih+y)*self.scale,width=self.iw*self.scale,height=self.ih*self.scale)
        c.restoreState();c.setStrokeColor(colors.HexColor('#d8dfd2'));c.rect(0,0,self.width,self.height,stroke=1,fill=0)
def shot(name,height=300,crop=None,caption='Stvarni lokalni ekran; svi prikazani kupci i iznosi su probni.'):
    story.append(Spacer(1,8));story.append(Screenshot(name,height,crop));story.append(Spacer(1,6));p(caption,'SmallGuide')

p('MLEKO I MLEKO  /  ADMIN','SmallGuide')
p('Svakodnevni rad,<br/>od porudžbine do uručenja.','TitleGuide')
p('Vodič za Marka · 2. novembar 2026.','SubGuide')
p('Prva verzija kreće sa gotovinom i prijavom kupaca email kodom. Ovaj vodič prati završene lokalne izmene; domen i stvarni servisi prolaze posebnu proveru pre objave.')
shot('guide-home-desktop-1440.png',260,(220,0,1220,1000))
sub('Jedan radni dan')
step(1,'Na Početnoj proveri datum, potrebne količine i upozorenja.')
step(2,'U Dostavama proveri Pakovanje, preuzmi spisak i završi pripremu.')
step(3,'U Razvozu potvrdi stvarno primljenu gotovinu i uručene količine.')
step(4,'Na kraju proveri neuručeno, delimične dostave i neuspešne poruke/račune.')
page()

title('1 / Naplata paketa')
p('<b>Kupac plaća ceo paket gotovinom pri prvoj dostavi.</b> Nedeljni paket ima četiri isporuke; dvonedeljni ima dve. Kraj kalendarskog meseca ne zatvara paket.')
sub('Primer: 2 L nedeljno, četiri isporuke')
p('2 L × 4 × 250 RSD = 2.000 RSD za mleko.<br/>4 posete × 350 RSD = 1.400 RSD za dostavu.<br/><b>Ceo paket: 3.400 RSD pri prvom uručenju.</b> Ovo su cene iz primera u razgovoru; stvarnu cenu uvek proveri u porudžbini.')
data=[['Poseta','Mleko','Gotovina za taj paket'],['Prva','2 L','3.400 RSD'],['Druga','2 L','0 RSD'],['Treća','2 L','0 RSD'],['Četvrta','2 L','0 RSD']]
t=Table(data,colWidths=[110,110,291],hAlign='LEFT');t.setStyle(TableStyle([('FONTNAME',(0,0),(-1,-1),'Guide'),('FONTNAME',(0,0),(-1,0),'GuideBold'),('FONTSIZE',(0,0),(-1,-1),10),('BACKGROUND',(0,0),(-1,0),colors.HexColor('#e7eddc')),('TEXTCOLOR',(0,0),(-1,-1),ink),('BOTTOMPADDING',(0,0),(-1,-1),12),('TOPPADDING',(0,0),(-1,-1),12),('LINEBELOW',(0,0),(-1,-1),.5,colors.HexColor('#d8dfd2'))]));story.append(t)
sub('Dve potvrde koje imaju različit posao')
p('<b>Uplata</b> kaže da je novac stvarno primljen. <b>Uručenje</b> kaže koliko je robe kupac dobio. Uplata sama ne razdužuje litre, a pakovanje se ne računa kao uručenje.')
p('Prva neplaćena gotovinska poseta ulazi u pripremu. Bez potvrđene gotovine paket ne može uspešno da se uruči. Ako kupac nije preuzeo robu ili nije platio, izaberi „Nije isporučeno“; količine i obaveza naplate ostaju.')
p('Posebno kupljen dodatak ima sopstvenu naplatu. Ako ima više redova iste porudžbine, gotovina za isti paket računa se jednom. Vlasnik ili menadžer potvrđuje novac; vozač može da potvrdi uručenje već plaćenog paketa.')
page()

title('2 / Prijava i nova porudžbina')
sub('Ulazak u admin')
p('Otvori /admin i unesi svoj admin email i lozinku. Admin prijava se razlikuje od prijave kupca: kupac unosi email i šestocifreni kod, bez pravljenja lozinke. Posle osvežavanja stranice admin može ponovo tražiti prijavu.')
sub('Ručni unos')
step(1,'Izaberi „+ Nova porudžbina“. Izaberi postojećeg kupca ili unesi ime, telefon i tačnu adresu.')
step(2,'Izaberi proizvode, količinu po poseti i jednokratnu ili redovnu dostavu. Proveri ukupan paket i dostavu.')
step(3,'Izaberi dozvoljeni datum i potvrdi. Novi Sad nudi petak. Inđija ostaje nedostupna dok vlasnik ne potvrdi i uključi raspored.')
step(4,'Ako porudžbina već postoji, otvori je; nemoj praviti novu zbog prekinute veze ili duplog klika.')
shot('guide-orders-desktop-1440.png',280,(220,0,1220,850))
p('Za telefonskog kupca email može ostati prazan. Takvom kupcu se ne šalje email i ne obećava se pristup nalogu dok mu se ne poveže potvrđena adresa.','SmallGuide')
page()

title('3 / Grupna potvrda gotovine')
step(1,'Otvori Porudžbine. Pretragom i filterima izdvoji porudžbine koje si naplatio.')
step(2,'Označi sve na prikazanoj stranici (do 100). Isključi svaku porudžbinu za koju novac nije primljen.')
step(3,'Izaberi „Potvrdi primljenu gotovinu“. Proveri broj porudžbina i ukupan iznos u prozoru.')
shot('guide-cash-desktop-1440.png',255,(300,300,840,400),'Pregled dve probne uplate; dugme ostaje isključeno dok se ne potvrdi stvarni prijem novca.')
step(4,'Tek nakon provere označi „Potvrđujem da je navedena gotovina stvarno primljena“ i sačuvaj.')
step(5,'Pročitaj rezultat za svaku stavku. Uspešne ostaju sačuvane i kada neka druga ne uspe. Osveži zastarelu stavku i proveri je pre nove potvrde.')
sub('Ako se veza prekine')
p('Ponovi isti zahtev iz otvorenog prozora. Zaštita od ponavljanja sprečava ponovnu uplatu, poruku i fiskalni događaj. Ako rezultat nije jasan, proveri status porudžbine pre novog rada.')
p('„Primeni filtere“ menja prikaz, ne naplatu. Neoznačene porudžbine ostaju nepromenjene. Grupna uplata ne potvrđuje uručene količine.')
page()

title('4 / Priprema i izvoz')
step(1,'Otvori Dostave i proveri izabrani datum. „Promeni datum“ otvara kalendar.')
step(2,'U prikazu Pakovanje proveri zbir po proizvodu, pojedinačne kupce, pauze i preskakanja. Prva gotovinska poseta može biti na spisku dok uplata čeka.')
step(3,'Preuzmi „Spisak za pakovanje · Excel“ ili „Spisak za vozača · CSV“. Izvoz ne znači da je roba uručena.')
shot('guide-pack-desktop-1440.png',260,(220,0,1220,900),'Prikaz Pakovanje sa kontrolisanim probnim rutama i zbirnim količinama.')
step(4,'Izaberi „Završi pripremu“ i potvrdi. Time zaključavaš pripremljeni spisak. Uplate za već zaključanu prvu gotovinsku posetu ne pomeraju taj datum.')
step(5,'Pređi u Razvoz za evidenciju stvarnog uručenja. Budući datum ne može da se označi kao već izvršen.')
p('„Podseti kupce za sutra“ prvo otvara pregled. Stvarno slanje zahteva povezan email servis i odgovarajući datum. U lokalnom probnom režimu poruke se ne šalju.','SmallGuide')
page()

title('5 / Uručenje, delimično i neuspešno')
p('U Dostave → Razvoz proveri adresu, telefon, napomenu, robu i iznos za naplatu. Ako prva poseta paketa traži gotovinu, vlasnik ili menadžer potvrđuje stvarno primljen ceo iznos.')
shot('guide-route-desktop-1440.png',280,(220,0,1220,1000),'Stvarni ekran Razvoz sa fiktivnim primaocima; u testu se proveravaju potpuno i delimično uručenje.')
sub('Potpuno uručenje')
p('Proveri količine i izaberi „Potvrdi isporuku“. Za više potpunih isporuka označi sve za taj datum, isključi izuzetke i otvori grupnu potvrdu. Pregledaj broj i gotovinu bez ponavljanja istog paketa.')
sub('Delimično uručenje')
p('U odgovarajućem redu promeni „Uručeno“ za svaku stavku na stvarno predatu količinu, pa potvrdi pojedinačno. Neuručeni ostatak ostaje obaveza. Delimične isporuke se ne obrađuju grupnom potvrdom potpunih isporuka.')
sub('Neuspešna poseta')
p('Izaberi „Nije isporučeno“. Ne potvrđuj prazno uručenje kao uspešno. Neuspešna prva poseta ne troši litre i ne označava gotovinu kao primljenu.')
page()

title('6 / Kupci i preostale količine')
step(1,'Otvori Kupci → Spisak kupaca i izaberi kupca. Podaci, Porudžbine, Redovne dostave i Istorija imaju različite namene.')
step(2,'U Redovnim dostavama izaberi preskok, pauzu ili nastavak i pregledaj sledeći termin pre potvrde. Važi rok izmene; zaključana poseta ostaje ista.')
step(3,'Kupci → Preostale količine prikazuje kupljeno, uručeno i ostatak. Primer: 2 komada × 4 isporuke = 8; 1 komad × 4 = 4. Različiti ostaci ne znače nužno da je neka dostava zaboravljena.')
step(4,'Promena količine ili ritma odnosi se na naredni paket. Za doplatu, zamenu ili povraćaj tekućeg plaćenog paketa proveri zaseban poslovni tok.')
sub('Pauza i preskok čuvaju dugovanu robu')
p('Paket može trajati duže od kalendarskog meseca. Preskok ili pauza ne brišu neuručene količine. Delimična poseta takođe čuva neuručeni deo.')
sub('Već postojeći kupci iz Excela')
p('Pre prenosa proveravaju se kontakt, ritam, sledeći datum, kupljeno, već uručeno i preostala plaćena vrednost. Probni izveštaj mora odgovarati Markovom odobrenom zbiru. Uvoz ne naplaćuje ponovo i ne izdaje novi dokument za staru uplatu.')
p('Posle prenosa kupac unosi isti stvarni email i kod. Telefonskom kupcu bez emaila najpre treba povezati potvrđenu adresu. Pogrešan ili tuđ email se ne spaja naslepo.')
sub('Podešavanja')
p('Osnovni rad ne zahteva promenu dana dostave. Napredna pravila i aktivacija Inđije pripadaju vlasniku. Za promenu cene dostave ili rasporeda prvo proveri uticaj na već zakazane obaveze.')
page()

title('7 / Kontrola na kraju dana')
step(1,'Uporedi stvarno primljenu gotovinu sa potvrđenim porudžbinama. Već plaćen paket se ne naplaćuje na narednim posetama.')
step(2,'Pregledaj neuspešne i delimične isporuke. Ostatak mora odgovarati robi koja još treba da stigne kupcu.')
step(3,'Proveri potrebne akcije na Početnoj i status emailova/fiskalnih dokumenata u odgovarajućim podešavanjima.')
step(4,'Kod nepoznatog ishoda fiskalnog poziva zatraži usaglašavanje. Ne pokušavaj naslepo novo izdavanje ili novu naplatu.')
sub('Fiskalni dokumenti')
p('Uplata paketa pokreće avansni tok. Svako stvarno uručenje razdužuje svoj deo i dobija račun po isporuci. Potpuna jednokratna gotovinska kupovina plaćena pri uručenju dobija običan račun. Trening dokumenti služe obuci; nisu dokaz aktivne produkcione fiskalizacije.')
sub('Pre zajedničke predaje')
p('Proći ceo probni dan: novu porudžbinu, prvi paket 3.400 RSD, neuspešnu prvu posetu, delimično uručenje, grupni izbor sa izuzecima, preskok/pauzu i izvoze. Posebno proveriti email kod, potvrdu, podsetnik i odgovor Marku u stvarnom test sandučetu.')
p('Stvarne fotografije, konačni tekst, Excel, potvrda Inđije, Resend/DNS i stvarni fiskalni tok imaju završnu proveru pre prebacivanja domena. Kartice se uvode kasnije po odobrenju banke. Najava kupcima šalje se tek kada novi sajt i njihov nalog zaista rade.')
p('Tehnička evidencija i postupak objave: docs/marko-release-2026-11-02.md. Ovaj vodič prikazuje lokalnu verziju i probne podatke, ne poslovne podatke kupaca.','SmallGuide')

out=root/'output/pdf/admin-vodic-marko.pdf';out.parent.mkdir(parents=True,exist_ok=True)
def footer(c,doc):
    c.setStrokeColor(colors.HexColor('#d8dfd2'));c.line(42,36,553,36);c.setFont('Guide',8);c.setFillColor(muted)
    c.drawString(42,22,'Mleko i Mleko · Admin vodič · 02.11.2026.');c.drawRightString(553,22,str(doc.page))
doc=SimpleDocTemplate(str(out),pagesize=(595.28,841.89),leftMargin=42,rightMargin=42,topMargin=38,bottomMargin=49,title='Mleko i Mleko — vodič za admin',author='Mleko i Mleko')
doc.build(story,onFirstPage=footer,onLaterPages=footer)
print(out)
