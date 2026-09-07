import { installHomeBackup } from '../core/pc-backup';
import { computeRequest } from '../core/compute/transport';

export function galleryHomeBackup(provider: string, afterBackup: () => void): () => Promise<void> {
    return () => installHomeBackup({
        app: 'gallery-reader', provider,
        call: command => computeRequest('backup-control', command),
    }, afterBackup)();
}
