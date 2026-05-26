const { Client } = require('@notionhq/client');
const fs = require('fs');
const path = require('path');
const https = require('https');

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const GITHUB_USERNAME = '0xTyche';
const DATABASE_ID = process.env.NOTION_DATABASE_ID;
const README_PATH = path.join(__dirname, '..', 'README.md');

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'profile-readme-updater' } }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

function extractText(arr) {
  return (arr || []).map(t => t.plain_text).join('');
}

function stripEmoji(str) {
  return (str || '').replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim();
}

function replaceSection(content, marker, replacement) {
  const re = new RegExp(
    `(<!-- ${marker}:START -->)[\\s\\S]*?(<!-- ${marker}:END -->)`,
    'g'
  );
  return content.replace(re, `$1\n${replacement}\n$2`);
}

async function fetchRepos() {
  const repos = await httpsGet(
    `https://api.github.com/users/${GITHUB_USERNAME}/repos?sort=updated&per_page=6&type=public`
  );
  return repos
    .filter(r => !r.fork && r.name !== GITHUB_USERNAME && r.name !== '0xTyche.github.io')
    .slice(0, 5)
    .map(r => {
      const desc = r.description ? ` — ${r.description}` : '';
      const stars = r.stargazers_count > 0 ? ` ⭐ ${r.stargazers_count}` : '';
      return `- [**${r.name}**](${r.html_url})${desc}${stars}`;
    })
    .join('\n');
}

async function fetchNotes() {
  const response = await notion.databases.query({
    database_id: DATABASE_ID,
    sorts: [{ timestamp: 'created_time', direction: 'descending' }],
    page_size: 8,
  });

  return response.results
    .map(page => {
      const props = page.properties;
      const task = extractText(props.Task?.title) || 'Untitled';
      const classification =
        props.Classification?.select?.name ||
        (props.Classification?.multi_select || []).map(s => s.name).join(', ') ||
        '';
      const date =
        props['Last Date']?.date?.start || page.created_time.split('T')[0];
      const tag = classification ? ` · \`${classification}\`` : '';
      return `- \`${date}\` **${task}**${tag}`;
    })
    .join('\n');
}

async function main() {
  let readme = fs.readFileSync(README_PATH, 'utf8');

  const [reposContent, notesContent] = await Promise.all([
    fetchRepos(),
    fetchNotes(),
  ]);

  readme = replaceSection(readme, 'REPOS', reposContent);
  readme = replaceSection(readme, 'NOTES', notesContent);

  fs.writeFileSync(README_PATH, readme, 'utf8');
  console.log('README.md updated');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
