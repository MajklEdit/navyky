# Firebase nastavení pro Google účet a cloud

1. Ve Firebase Console vytvoř projekt a zapni **Authentication → Google** a **Firestore Database**.
2. Přidej webovou aplikaci a její hodnoty vlož do lokálního `.env` podle `.env.example`.
3. Přidej Android aplikaci s package name `com.fireup.app`, doplň SHA-1/SHA-256 podpisu a stažený `google-services.json` vlož do `android/app/`.
4. Ve Firestore nastav pravidla tak, aby uživatel mohl číst a zapisovat jen svůj dokument:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

5. Spusť `npm run sync` a sestav Android aplikaci z Android Studia.

Soubor `.env` ani `google-services.json` necommituj; obsahují konfiguraci konkrétního projektu.
