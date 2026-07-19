# Changelog

Vad som ändrades och varför — en rad per logisk ändring. (Hur:et finns i git-historiken.)

## 2026-07-18
- Appinloggning är nu enbart siffror — 4-siffrigt användarnummer + PIN — så att delade butikstelefoner aldrig hanterar lösenord; lösenordsinloggning mot API:t avvisas med 403.
- Expo-appen låst till SDK 54 eftersom App Stores Expo Go inte kör nyare SDK:er.
- Appen talar nu alla sju språken: de fem återstående (tyska, nederländska, norska, danska, finska) översatta med samma terminologi som webben, så varje expedit möter appen på sitt eget språk oavsett vilket.
- API-tokenverifieringen härdad: en token med otydlig autentiseringsmetod tolkas nu som lägst privilegierad (PIN, inte lösenord) och signeringsalgoritmen är låst, så en framtida tokenbugg inte kan höja sig till lösenordsnivå.

## 2026-07-17
- Per-användare språkval infört som grund för flerspråkighet, så varje expedit möter appen på sitt eget språk.
- Skanningsflödet och därefter alla expedit-ytor översatta till alla sju språken (admin medvetet kvar på engelska).
- Larmkort på admin-översikten när en transportörshändelse dödköats efter 20 försök, så tysta leveransfel inte förblir oupptäckta.
- Transportörsstatus-uppslag på paketdetaljen för borttappade paket, så personalen kan svara kunden direkt i disken (NOT_CONFIGURED tills API-nycklar finns).
- `/api/v1` med bearer-tokens som HTTP-säm för mobilappen, med DB-färsk användarkontroll per anrop.
- Expo-app för ombud: inloggning, kameraskanning för in-/utcheckning, utlämningsverifiering (QR/ID), paketlista/-detalj och offlinekö — hela paketflödet från en telefon utan dator.
