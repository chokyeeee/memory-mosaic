// GET /api/cells — 列出所有已上传的格子图片
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { GITHUB_TOKEN, GITHUB_REPO } = process.env;

  try {
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/contents/photos`,
      {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );

    // 目录不存在时返回空列表
    if (response.status === 404) {
      return res.status(200).json({ cells: [] });
    }

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const files = await response.json();
    const cells = files
      .filter((f) => f.type === 'file')
      .map((f) => {
        const name = f.name.replace(/\.[^.]+$/, '');
        return {
          name,
          sha: f.sha,
          download_url: f.download_url,
        };
      });

    return res.status(200).json({ cells });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
}
