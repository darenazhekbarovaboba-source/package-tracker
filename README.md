# Package Tracker

A free shipment log that runs entirely in your browser. Record USPS, China Post, EMS, Cainiao, UPS, FedEx, DHL, and purchasing-agent packages, keep a status history, and open official tracking pages when you need an update.

**Live app:** https://darenazhekbarovaboba-source.github.io/package-tracker/

## What it does

- Add a regular shipment or an agent / forwarder order (with warehouse stages and domestic plus international tracking numbers)
- Auto-detect the carrier from common number formats (USPS, China Post / EMS `..CN` numbers, UPS, FedEx, DHL, Cainiao)
- Track buttons open the official carrier site and a [17TRACK](https://t.17track.net/en) fallback in a new tab
- Status history you log yourself (status, location, and a note) — this page never calls a carrier API
- Estimated delivery with a days-left countdown and an overdue highlight
- Filters (all / active / delivered, and by carrier), search, and sort by estimated delivery
- Totals for active packages, arrivals this week (Sunday–Saturday), overdue, and delivered this month
- Copy a tracking number, edit or delete a package, and export or import a JSON backup
- Optional sample data (button or `?demo=1`). Demo data stays in memory only and is never written to this browser’s saved list

Your data is saved only in this browser with `localStorage`. There is no account and no server. Clearing site data will erase the list.

## Run locally

Open `index.html` in a browser, or serve the folder with any static file server.
