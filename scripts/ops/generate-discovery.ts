import { mkdir, rm, writeFile } from 'node:fs/promises';
import { buildRootInfo } from '../../src/index.js';
import { buildDiscoveryAssets } from '../../src/pages/discovery.js';

const directory = 'public-discovery';
await rm(directory, { recursive: true, force: true });
await mkdir(directory, { recursive: true });
for (const [name, content] of Object.entries(buildDiscoveryAssets(buildRootInfo()))) {
  await writeFile(`${directory}/${name}`, content, 'utf8');
}
console.log('현재 레지스트리의 HTML·JSON·robots·sitemap·llms 정적 자산 생성 완료');
