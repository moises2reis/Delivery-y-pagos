export const $ = (s) => document.querySelector(s);
export const $$ = (s) => document.querySelectorAll(s);
export const toast = (m) => console.log('Toast:', m);
export const formatNumber = (n) => Number(n).toLocaleString();
