// DELETE /api/delete?name=1-1 — 从 GitHub 仓库删除某格图片
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cellName = req.query.name;
  if (!cellName || !/^\d+-\d+$/.test(cellName)) {
    return res.status(400).json({ error: 'Invalid cell name' });
  }

  const { GITHUB_TOKEN, GITHUB_REPO } = process.env;

  try {
    // 列出 photos 目录找到对应文件
    const listRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/contents/photos`,
      {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );

    if (!listRes.ok) {
      return res.status(200).json({ ok: true }); // 目录不存在，无需删除
    }

    const files = await listRes.json();
    for (const f of files) {
      const fName = f.name.replace(/\.[^.]+$/, '');
      if (fName === cellName) {
        await fetch(
          `https://api.github.com/repos/${GITHUB_REPO}/contents/photos/${f.name}`,
          {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${GITHUB_TOKEN}`,
              Accept: 'application/vnd.github.v3+json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              message: `删除 ${cellName}`,
              sha: f.sha,
            }),
          }
        );
      }
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
}
