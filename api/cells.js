// GET /api/cells?v=1 — 列出所有已上传的格子图片
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { GITHUB_TOKEN, GITHUB_REPO } = process.env;
  const version = req.query.v || '1';
  const dir = `photos/v${version}`;

  try {
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/contents/${dir}`,
      {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );

    if (response.status === 404) {
      return res.status(200).json({ cells: [], version });
    }

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const files = await response.json();
    const cells = files
      .filter((f) => f.type === 'file')
      .map((f) => {
        const name = f.name.replace(/\.[^.]+$/, '');
        return { name, sha: f.sha };
      });

    return res.status(200).json({ cells, version });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
}
