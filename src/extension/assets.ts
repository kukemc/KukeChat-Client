import { EXTENSION_ID } from '@/config';

export const extensionId = EXTENSION_ID;

const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect width="128" height="128" rx="34" fill="#171717"/><rect x="10" y="10" width="108" height="108" rx="28" fill="#262626" stroke="#525252" stroke-width="2"/><path d="M31 42c0-8.284 6.716-15 15-15h36c8.284 0 15 6.716 15 15v21c0 8.284-6.716 15-15 15H59.8L41.2 94.6C38.6 96.9 34.5 95 34.5 91.5V77.7C28.1 75.9 23.5 70 23.5 63V42H31Z" fill="#f4f4f5"/><circle cx="50" cy="54" r="5.8" fill="#171717"/><circle cx="64" cy="54" r="5.8" fill="#737373"/><circle cx="78" cy="54" r="5.8" fill="#171717"/></svg>`;
const coverSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270" viewBox="0 0 480 270"><rect width="480" height="270" rx="28" fill="#171717"/><rect x="24" y="24" width="432" height="222" rx="24" fill="#242424" stroke="#404040"/><rect x="96" y="46" width="288" height="178" rx="32" fill="#262626" stroke="#525252"/><rect x="124" y="76" width="184" height="20" rx="10" fill="#f4f4f5"/><rect x="124" y="112" width="232" height="18" rx="9" fill="#737373" opacity=".7"/><rect x="124" y="146" width="128" height="18" rx="9" fill="#a3a3a3" opacity=".8"/><path d="M170 205l36-31h112c19.9 0 36-16.1 36-36V91c0-19.9-16.1-36-36-36H157c-19.9 0-36 16.1-36 36v47c0 17.7 12.8 32.5 29.6 35.4V197c0 10.2 11.9 15.7 19.4 8Z" fill="#ffffff" opacity=".08"/></svg>`;

function toDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export const Icon = toDataUri(iconSvg);
export const Cover = toDataUri(coverSvg);
