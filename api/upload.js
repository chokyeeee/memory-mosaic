// PUT /api/upload?name=1-1 — 上传图片到 GitHub 仓库
export const config = {
  api: { bodyParser: { sizeLimit: '10mb' } },
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cellName = req.query.name;
  if (!cellName || !/^\d+-\d+$/.test(cellName)) {
    return res.status(400).json({ error: 'Invalid cell name' });
  }

  const { GITHUB_TOKEN, GITHUB_REPO } = process.env;
  const contentType = req.headers['content-type'] || 'image/jpeg';
  const ext = contentType.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
  const filePath = `photos/${cellName}.${ext}`;

  try {
    // 读取请求体为 Buffer
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    const base64Content = buffer.toString('base64');

    // 检查文件是否已存在（需要 sha 来更新）
    let sha = undefined;

    // 先尝试删除同名但不同扩展名的旧文件
    const listRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/contents/photos`,
      {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );

    if (listRes.ok) {
      const files = await listRes.json();
      for (const f of files) {
        const fName = f.name.replace(/\.[^.]+$/, '');
        if (fName === cellName) {
          if (f.name === `${cellName}.${ext}`) {
            // 同文件名同扩展名 → 更新，需要 sha
            sha = f.sha;
          } else {
            // 同格子不同扩展名 → 删除旧文件
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
                  message: `删除旧图片 ${f.name}`,
                  sha: f.sha,
                }),
              }
            );
          }
        }
      }
    }

    // 上传（创建或更新）文件
    const body = {
      message: `上传 ${cellName}`,
      content: base64Content,
    };
    if (sha) body.sha = sha;

    const uploadRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/contents/${filePath}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );

    if (!uploadRes.ok) {
      const err = await uploadRes.json();
      throw new Error(JSON.stringify(err));
    }

    const result = await uploadRes.json();
    return res.status(200).json({
      ok: true,
      download_url: result.content.download_url,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
}
