import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const vercelConfigPath = path.join(repoRoot, 'vercel.json');
const outputDir = path.join(repoRoot, '.vercel', 'output');
const outputConfigPath = path.join(outputDir, 'config.json');

const rawConfig = fs.readFileSync(vercelConfigPath, 'utf8');
const vercelConfig = JSON.parse(rawConfig);

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const sourceToRegex = (source) => {
    if (!source || source === '/') {
        return '^/$';
    }

    const segments = source.split('/').filter(Boolean);
    const regexSegments = segments.map((segment) => {
        if (segment.startsWith(':') && segment.endsWith('*')) {
            return '(?:/(.*))?';
        }
        if (segment.startsWith(':')) {
            return '/([^/]+)';
        }
        return `/${escapeRegex(segment)}`;
    });

    return `^${regexSegments.join('')}$`;
};

const destinationToRoute = (source, destination) => {
    if (!destination) {
        return destination;
    }

    const parameterNames = Array.from(source.matchAll(/:([A-Za-z0-9_]+)\*?/g), (match) => match[1]);

    return destination.replace(/:([A-Za-z0-9_]+)\*?/g, (_, name) => {
        const parameterIndex = parameterNames.indexOf(name);
        return parameterIndex >= 0 ? `$${parameterIndex + 1}` : '';
    });
};

const routes = [];

for (const redirect of vercelConfig.redirects || []) {
    routes.push({
        src: sourceToRegex(redirect.source),
        status: redirect.permanent ? 308 : 307,
        headers: {
            Location: redirect.destination,
        },
    });
}

for (const rewrite of vercelConfig.rewrites || []) {
    routes.push({
        src: sourceToRegex(rewrite.source),
        dest: destinationToRoute(rewrite.source, rewrite.destination),
    });
}

routes.push({ handle: 'filesystem' });

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(
    outputConfigPath,
    JSON.stringify({ version: 3, routes }, null, 2) + '\n',
    'utf8',
);

console.log(`Wrote ${path.relative(repoRoot, outputConfigPath)}`);