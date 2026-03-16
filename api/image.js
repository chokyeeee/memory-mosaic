// GET /api/image?name=1-1 — 代理 GitHub 图片（避免国内直连 raw.githubusercontent.com 慢）
export default async function handler(req, res) {
  if (req.method !== 'GET') {
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
      return res.status(404).json({ error: 'not found' });
    }

    const files = await listRes.json();
    const target = files.find(
      (f) => f.name.replace(/\.[^.]+$/, '') === cellName
    );

    if (!target) {
      return res.status(404).json({ error: 'not found' });
    }

    // 通过 GitHub API 获取文件内容（base64）
    const fileRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/contents/photos/${target.name}`,
      {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );

    if (!fileRes.ok) {
      return res.status(404).json({ error: 'not found' });
    }

    const fileData = await fileRes.json();
    const buffer = Buffer.from(fileData.content, 'base64');

    // 根据扩展名推断 Content-Type
    const ext = target.name.split('.').pop().toLowerCase();
    const mimeMap = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      gif: 'image/gif',
    };

    res.setHeader('Content-Type', mimeMap[ext] || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');
    return res.status(200).send(buffer);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
}
