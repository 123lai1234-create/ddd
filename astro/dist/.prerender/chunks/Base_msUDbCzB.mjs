import { c as createComponent } from './astro-component_DIKdwFAr.mjs';
import 'piccolore';
import { a as renderTemplate, b as addAttribute, d as renderSlot, e as renderHead, r as renderComponent, F as Fragment, m as maybeRenderHead, u as unescapeHTML } from './prerender_OQTAnlvW.mjs';

var __freeze = Object.freeze;
var __defProp = Object.defineProperty;
var __template = (cooked, raw) => __freeze(__defProp(cooked, "raw", { value: __freeze(cooked.slice()) }));
var _a, _b;
const $$Base = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$props, $$slots);
  Astro2.self = $$Base;
  const {
    title,
    description = "",
    ogImage = "https://donttalk.vercel.app/og-image.svg",
    bodyPage,
    pageStyles = [],
    pageScripts = [],
    headInline = ""
  } = Astro2.props;
  return renderTemplate(_b || (_b = __template([`<html lang="zh-TW"> <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><script>document.documentElement.classList.add('js-reveal');<\/script><title>`, '</title><meta name="description"', '><meta property="og:title"', '><meta property="og:description"', '><meta property="og:type" content="website"><meta name="twitter:card" content="summary_large_image"><meta property="og:image"', '><meta name="twitter:image"', `><link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🧬</text></svg>"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&family=Space+Grotesk:wght@400;500;600;700&display=swap" onload="this.onload=null;this.rel='stylesheet'">`, '<noscript><link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet"></noscript><link rel="stylesheet" href="/styles/shared.css"><link rel="stylesheet" href="/styles/polish.css"><link rel="stylesheet" href="/styles/dynamic.css">', '<script src="/scripts/theme-randomizer.js"><\/script><script src="/scripts/shader-bg.js" defer><\/script><script src="/scripts/admin-mode.js"><\/script><script src="/scripts/site-shell-config.js" defer><\/script><script src="/scripts/nav.js" defer><\/script><script src="/scripts/app-config.js" defer><\/script><script src="/scripts/dynamic-features.js" defer><\/script>', "", "</head> <body", "> ", " ", " </body> </html>"])), title, addAttribute(description, "content"), addAttribute(title, "content"), addAttribute(description, "content"), addAttribute(ogImage, "content"), addAttribute(ogImage, "content"), maybeRenderHead(), pageStyles.map((href) => renderTemplate`<link rel="stylesheet"${addAttribute(href, "href")}>`), renderComponent($$result, "Fragment", Fragment, {}, { "default": ($$result2) => renderTemplate`${unescapeHTML(headInline)}` }), renderHead(), addAttribute(bodyPage, "data-page"), renderSlot($$result, $$slots["default"]), pageScripts.map((src) => renderTemplate(_a || (_a = __template(["<script", "><\/script>"])), addAttribute(src, "src"))));
}, "D:/project/astro/src/layouts/Base.astro", void 0);

export { $$Base as $ };
