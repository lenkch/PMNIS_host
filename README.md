# Spustenie projektu

Projekt je už nasadený online a je dostupný na:
https://lenkch.github.io/PMNIS_host/

---

Tento projekt je postavený iba na **HTML a JavaScripte**, ale kvôli obmedzeniam prehliadača (CORS) ho **nie je možné spustiť priamo otvorením súboru (`file://`)**.

Je potrebné ho spustiť cez jednoduchý lokálny server.

---

## Požiadavky

* Nainštalovaný **Python 3**

---

## Postup

1. Otvor terminál (CMD, PowerShell, Terminal)
2. Prejdi do priečinka projektu (tam, kde je `index.html`)

```bash
cd cesta/k/projektu
```

3. Spusti jednoduchý HTTP server:

```bash
python3 -m http.server 8081
```

4. Otvor prehliadač a choď na:

```
http://localhost:8081
```

---

## Poznámky

* Port `8081` môžeš zmeniť na ľubovoľný (napr. 3000, 8000...)
* Ak server nespustíš, JavaScript môže zlyhať kvôli CORS chybám
* Server stačí spustiť iba lokálne — nie je potrebný žiadny backend

---

Hotovo 🎉
