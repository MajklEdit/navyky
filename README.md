# FireHabits — Android appka (Capacitor)

Tenhle projekt zabalí appku, kterou jsme dělali, do skutečné Android appky
s reálnými systémovými notifikacemi a daty, co přežijí zavření appky.

## Co budeš potřebovat

1. **Node.js** (LTS verze) — https://nodejs.org
2. **Android Studio** — https://developer.android.com/studio
   - Při instalaci nech zaškrtnuté "Android SDK", "Android SDK Platform", "Android Virtual Device"
3. **Telefon s Androidem** + kabel USB
   - Na telefonu: Nastavení → O telefonu → 7× ťukni na "Číslo sestavení" (odemkne to vývojářský režim)
   - Nastavení → Možnosti pro vývojáře → zapni "Ladění USB"

## Postup

### 1. Nainstaluj závislosti
Otevři terminál ve složce projektu a spusť:

```bash
npm install
```

### 2. Přidej Android platformu

```bash
npx cap add android
```

Tím se vytvoří složka `android/` se skutečným Android Studio projektem.

### 3. Zabuilduj appku a synchronizuj do Androidu

```bash
npm run sync
```

(Tenhle příkaz udělá `vite build` a pak `npx cap sync android` — vezme webový build a nakopíruje ho do nativního projektu.)

### 4. Otevři v Android Studiu

```bash
npm run open:android
```

Android Studio se otevře se zabaleným projektem. Počkej, až doběhne "Gradle sync" (dole ve stavovém řádku).

### 5. Připoj telefon a spusť

- Připoj telefon kabelem USB
- Na telefonu odsouhlas "Povolit ladění USB" (vyskočí to jako notifikace)
- V Android Studiu nahoře vyber svůj telefon v seznamu zařízení
- Klikni na zelené tlačítko ▶️ (Run)

Appka se nainstaluje a spustí přímo na tvém telefonu. Zůstane tam nastálo,
dokud ji ručně neodinstaluješ — nejde o dočasnou instalaci.

### 6. Povol notifikace

Při prvním spuštění appka požádá o povolení notifikací (Android 13+).
Klikni "Povolit" — bez toho by se připomínky nezobrazovaly.

## Jak to funguje uvnitř

- **`src/storage.js`** — nahrazuje dočasné úložiště z prototypu za `@capacitor/preferences`,
  které data ukládá přímo do telefonu. Přežijí restart appky i telefonu.
- **`src/notifications.js`** — pro každý návyk typu "check" (léky, prášky, trénink)
  s nastaveným časem naplánuje skutečnou systémovou notifikaci. Pokud má návyk
  vybrané konkrétní dny (např. trénink Po/St/Pá), naplánuje se zvlášť pro každý den.
  Pitný režim a spánek notifikaci zatím nemají (jsou to celodenní cíle, ne
  jeden pevný čas) — dá se doplnit později, např. večerní připomínka "zkontroluj vodu/spánek".
- **`src/App.jsx`** — stejná appka jako v prototypu, jen napojená na výše uvedené dva soubory.

## Když budeš chtít appku upravit

Po každé změně v `src/App.jsx` stačí znovu spustit:

```bash
npm run sync
```

a appku znovu pustit z Android Studia (krok 5). Nemusíš znovu dělat `cap add android`.

## Případné problémy

- **"Gradle sync failed"** — otevři Android Studio → Tools → SDK Manager a zkontroluj,
  že máš nainstalovanou aspoň jednu Android SDK Platform (např. API 34).
- **Telefon se nezobrazuje v seznamu zařízení** — zkus jiný USB kabel (některé jsou jen nabíjecí,
  ne datové) nebo v telefonu potvrď dialog "Povolit ladění USB", pokud ti utekl.
- **Notifikace nechodí přesně na čas** — na některých telefonech (Xiaomi, Huawei, OnePlus...)
  je potřeba appce ručně povolit "Autostart" nebo vypnout optimalizaci baterie pro appku
  v nastavení telefonu, jinak systém plánované notifikace uspává.
