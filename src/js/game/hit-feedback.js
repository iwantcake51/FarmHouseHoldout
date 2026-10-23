// Hit-stop and time scale.

export let timeScale = 1;

// setters for the variables above that other files change (an imported variable can only be read)
export function setTimeScale(v) { return (timeScale = v); }
