// Backup files: download the saved state as JSON, and read one back (upgraded to the current
// format by migrate()). Asking the user and replacing the state is up to the caller.
import { migrate } from './model.js';
import { el } from './ui.js';

export function downloadBackup(state) {
  // The plate lookup key is left out: a backup file may be shared, the key stays on this device.
  const data = { ...state, draft: null, plateKey: '', exportedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = el('a', {
    href: URL.createObjectURL(blob),
    download: `rideguide-${new Date().toISOString().slice(0, 10)}.json`,
  });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Returns the backup's state in the current format, or null if the file is not a RideGuide backup.
export async function readBackup(file, fallbackLang) {
  try {
    return migrate(JSON.parse(await file.text()), fallbackLang);
  } catch {
    return null;
  }
}
