# BrandPrint privacy

BrandPrint reads the page you are on and keeps the result on your computer. It has no account, no analytics, and no server of its own.

## What it reads

When you click the icon on a tab, the extension reads that page in place:

- Rendered colors, including fills, text, borders, and CSS gradients
- Fonts, weights, and the type scale
- Button styles for the primary and secondary actions
- Spacing and corner radius
- Visible headings and other on-page copy, used to describe the voice

A named CSS color counts only when something visible uses it. Pixels inside photos and illustrations are not sampled.

## Screenshot check

After the read, Chrome may capture a picture of the visible tab. BrandPrint uses that picture only to compare the CSS colors with the pixels on screen, and to correct a color when the two do not match.

The picture is handled in memory for that check. It is not uploaded, and it is not written into the saved brand record.

## What is stored

The brand record is saved in `chrome.storage.session`. That includes the page address, the colors, the type, the button styles, and the copy used for the voice. Session storage is cleared when the browser session ends. BrandPrint does not use `chrome.storage.local` or `chrome.storage.sync`.

Picked colors you sample with “Pick color from screen” stay in that same session record.

## What leaves your computer

- **brand.md.** The file is saved to your downloads folder, or copied to your clipboard, only when you ask.
- **PDF.** Save PDF uses the browser print dialog. The file stays wherever you save it.
- **Fonts.** If the page already loads a font from `fonts.googleapis.com` or `use.typekit.net`, the guide requests that same stylesheet so the specimens match. That request goes to Google Fonts or Adobe Fonts. No other font host is requested.
- **The credit link.** “Mubasil” in the footer opens [mubasil.me](https://mubasil.me) only if you click it.

BrandPrint does not send the brand record, the screenshot, or the page copy to the author or to an AI service. Generating assets from `brand.md` happens in whatever tool you paste the file into. That tool has its own privacy terms.

## Permissions

`activeTab` limits the read to the tab where you click the icon. `scripting` injects the reader. `downloads` saves `brand.md`. `storage` holds the session record described above.

## Contact

Questions about this policy can go through [mubasil.me](https://mubasil.me).
