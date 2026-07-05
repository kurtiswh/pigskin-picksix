/**
 * Shared email shell — one brand look for every email (header, palette, font,
 * button, panels, footer). Brand: Pigskin Brown #4B3621 + Goal-Post Gold #C9A04E.
 * All template HTML should render its unique content into emailShell().
 */

export const EMAIL = {
  brown: '#4B3621',
  gold: '#C9A04E',
  ink: '#2A2118',
  muted: '#7A6E60',
  line: '#E5DFD5',
  bg: '#F0EEE8',
}

/** Primary CTA button — gold on brown, consistent everywhere. */
export function emailButton(label: string, url: string): string {
  return `<div style="text-align:center;margin:28px 0">
    <a href="${url}" style="background:${EMAIL.gold};color:${EMAIL.brown};font-weight:800;text-decoration:none;padding:13px 28px;border-radius:8px;display:inline-block;font-size:15px">${label}</a>
  </div>`
}

type PanelTone = 'gold' | 'red' | 'green' | 'info'
/** Consistent tinted callout panel. */
export function emailPanel(html: string, tone: PanelTone = 'gold'): string {
  const map: Record<PanelTone, [string, string, string]> = {
    gold: ['#FBF3DC', '#EAD9AE', '#8a6d1f'],
    red: ['#FBEAEA', '#EFB9B9', '#B23A3A'],
    green: ['#E6F4EC', '#C6E4D2', '#1f7a49'],
    info: ['#EAF2F6', '#CFE2EA', '#2F6F8F'],
  }
  const [bg, border, text] = map[tone]
  return `<div style="background:${bg};border:1px solid ${border};border-radius:8px;padding:16px 18px;margin:18px 0;color:${text};font-size:15px;line-height:1.5">${html}</div>`
}

/** Wrap unique body content in the brand shell. */
export function emailShell(o: { subtitle?: string; heading?: string; bodyHtml: string; preheader?: string }): string {
  return `<div style="margin:0;padding:0;background:${EMAIL.bg}">
  ${o.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${o.preheader}</div>` : ''}
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px 16px;color:${EMAIL.ink}">
    <div style="background:${EMAIL.brown};border-radius:12px 12px 0 0;padding:22px 24px;text-align:center">
      <div style="color:#ffffff;font-size:22px;font-weight:800;letter-spacing:.02em">🏈 PIGSKIN PICK SIX</div>
      <div style="height:3px;width:54px;background:${EMAIL.gold};margin:10px auto 0;border-radius:2px"></div>
      ${o.subtitle ? `<div style="color:#E9DFcd;font-size:12px;margin-top:10px;text-transform:uppercase;letter-spacing:.12em;font-weight:700">${o.subtitle}</div>` : ''}
    </div>
    <div style="background:#ffffff;border:1px solid ${EMAIL.line};border-top:none;border-radius:0 0 12px 12px;padding:28px 26px">
      ${o.heading ? `<h2 style="color:${EMAIL.brown};margin:0 0 14px;font-size:20px">${o.heading}</h2>` : ''}
      ${o.bodyHtml}
      <div style="border-top:1px solid ${EMAIL.line};margin-top:28px;padding-top:16px;text-align:center;color:${EMAIL.muted};font-size:12px;line-height:1.6">
        <div style="font-weight:700;color:${EMAIL.brown}">The Pigskin Pick Six Team</div>
        <div style="margin-top:4px"><a href="https://pigskinpicksix.com" style="color:${EMAIL.muted}">pigskinpicksix.com</a> · <a href="https://pigskinpicksix.com/profile" style="color:${EMAIL.muted}">email preferences</a></div>
      </div>
    </div>
  </div>
</div>`
}

/** Shared paragraph + list helpers (brand ink color). */
export const p = (html: string) => `<p style="color:${EMAIL.ink};font-size:15px;line-height:1.55;margin:0 0 14px">${html}</p>`
export const bullets = (items: string[]) =>
  `<ul style="color:${EMAIL.ink};font-size:15px;line-height:1.55;margin:0 0 14px;padding-left:20px">${items.map(i => `<li>${i}</li>`).join('')}</ul>`
