// DOM shortcut and the three.js availability check.

const $ = id => document.getElementById(id);
if (!window.THREE) { $('title').querySelector('p').textContent = 'The 3D engine could not load. Check your connection and reload the page.'; return; }
