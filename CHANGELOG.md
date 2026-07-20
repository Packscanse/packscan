# Changelog

Vad som ändrades och varför — en rad per logisk ändring. (Hur:et finns i git-historiken.)

## 2026-07-20
- Ombudshämtning kräver nu båda id-handlingarna, som vid disken i praktiken: anges ett ombud måste både mottagarens och ombudets foto-ID kontrolleras (skannas eller bockas i) innan utlämningen kan bekräftas, och spårloggen skiljer på vems ID som kontrollerades. Endast typ och faktum sparas — aldrig handlingarnas innehåll.
- Flerpaketsutlämning: skannas ett paket i hämtningsflödet listas kundens övriga hyllpaket (matchade på telefon, i andra hand exakt namn) som en checklista — varje paket bockas av genom att dess etikett skannas, ID-kontrollen följer med mellan paketen så den görs en gång per besök, och koder anges per paket där transportörens policy kräver det. Paket som inte skannas av lämnas orörda på hyllan.
- Hela webben renderar nu i det avsedda typsnittet (Geist) — fontvariabeln var cirkulärt definierad så webbläsaren föll tillbaka på serif.
- Hämtningsflödet hoppar direkt till utlämningsverifieringen när kollit redan står på hyllan, i stället för att visa ett tomt registreringsformulär; låst bekräftaknapp förklarar nu vad som saknas.
- Destruktiva knappar (avbryt paket, inaktivera) har fått en enhetlig kantad blek stil så att de aldrig kan förväxlas med butiksfärgade primärknappar; rollbadgar är neutrala så rött förbehålls larm.
- Användaradmin visar en kompakt tabell med en Hantera-knapp per rad — livscykelkontrollerna öppnas i en panel i stället för att stapla fem formulär i varje rad.
- Nya konton ärver skaparens språk och demokontona är svenska, så inloggning och app talar samma språk; kamerafel på skanningsskärmen översatta.
- Föraviseringsimporten visar giltiga transportörskoder och validerar per rad med radnummer före inskick.
- Paketlistans rader är klickbara i sin helhet, paketdetaljen har tillbakalänk och samlade åtgärder med avbryt avskilt, och admin-larm visar rubrik med tekniska detaljer hopfällda.

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
