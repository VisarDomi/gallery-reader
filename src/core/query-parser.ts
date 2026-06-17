export function parseQuery(raw: string): { positive: string[]; negative: string[] } {
    const terms = raw.split(/\s+/).filter(Boolean);
    const positive: string[] = [];
    const negative: string[] = [];
    for (const term of terms) {
        if (term.startsWith('-')) {
            const value = term.slice(1);
            if (value) negative.push(value);
        } else {
            positive.push(term);
        }
    }
    if (positive.length === 0) {
        positive.push('language:japanese');
    }
    return { positive, negative };
}
