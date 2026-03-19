// sources/biquge.js

const SourceBiquge = {
  name: "biquge",
  pattern: /^https?:\/\/www\.biquge\.tw\/book\/\d+\/?$/,

  async fetchPreview(url) {
    const resp = await fetch(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "zh-CN,zh;q=0.9",
      },
    });

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const html = await resp.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    const titleTag = doc.querySelector("h1");
    const authorTag = doc.querySelector(".small span");
    const descTag = doc.querySelector("#intro, .intro");

    return {
      bookName: titleTag?.textContent.trim() || null,
      authorName: authorTag?.textContent.replace("作者：", "").trim() || null,
      coverImage: null, // biquge thường không có hoặc phải parse thêm
      sourceBookCode: url.match(/book\/(\d+)/)?.[1] || null,
      url,
      description: descTag?.textContent.trim().slice(0, 200) || null,
    };
  },

  async fetchChapters(bookUrl) {
    const bookId = bookUrl.match(/book\/(\d+)/)?.[1];
    if (!bookId) throw new Error("Không lấy được book ID");

    const resp = await fetch(bookUrl, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "zh-CN,zh;q=0.9",
      },
    });

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const html = await resp.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    const links = [...doc.querySelectorAll("ul li a[href*='/book/']")];

    return links
      .map((a) => {
        const href = a.getAttribute("href") || "";

        if (!href.includes(`/book/${bookId}/`)) return null;

        return {
          chapter_title: a.textContent.trim(),
          chapter_url: `https://www.biquge.tw${href}`,
        };
      })
      .filter(Boolean)
      .map((c, i) => ({
        ...c,
        chapter_number: i + 1,
      }));
  },

  async fetchContent(chapterUrl) {
    let currentUrl = chapterUrl;
    let fullText = [];
    let visited = new Set();

    while (currentUrl && !visited.has(currentUrl)) {
      visited.add(currentUrl);

      const resp = await fetch(currentUrl, {
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "zh-CN,zh;q=0.9",
          Referer: chapterUrl,
        },
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const html = await resp.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");

      // title
      const titleTag = doc.querySelector("h1");

      // content
      const contentNodes = [...doc.querySelectorAll("#chaptercontent p")];

      const paragraphs = contentNodes
        .map((p) => p.textContent.trim())
        .filter((t) => t.length > 0);

      fullText.push(...paragraphs);

      // 👉 detect next page (cực quan trọng)
      const nextPageBtn = doc.querySelector("#next_url");

      if (!nextPageBtn) break;

      const nextHref = nextPageBtn.getAttribute("href");

      // nếu next là chapter mới → STOP
      if (!nextHref.includes("_")) break;

      currentUrl = `https://www.biquge.tw${nextHref}`;
    }

    return {
      chapter_title: docTitleCleanup(fullText[0]) || null, // fallback
      chapter_url: chapterUrl,
      content: fullText.join("\n\n") || null,
    };
  },
};

// helper
function docTitleCleanup(text) {
  if (!text) return null;
  return text.replace(/\（\d+ \/ \d+\）/, "").trim();
}
