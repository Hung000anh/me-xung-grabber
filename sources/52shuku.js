// sources/52shuku.js

const Source52shuku = {
  name: "52shuku",
  pattern: /^https?:\/\/www\.52shuku\.net\/.+\.html$/,

  // Lấy thông tin sách
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

    // Title nằm trong <h1 class="article-title" id="nr_title">
    const titleTag = doc.querySelector("h1.article-title");
    const title = titleTag?.textContent.trim() || null;

    // Description nằm trong #intro hoặc .intro hoặc .desc
    const descTag = doc.querySelector("body > section > div > div > article > p:nth-child(2)");
    const description = descTag?.textContent.trim().slice(0, 200) || null;

    return {
      bookName: title,
      authorName: null, // Site không cung cấp tác giả rõ ràng
      coverImage: null, // Không có cover
      sourceBookCode: null,
      url,
      description,
    };
  },

  // Lấy danh sách chương
  async fetchChapters(bookUrl) {
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

    // Danh sách chương trong <ul class="list clearfix"> a
    const links = [...doc.querySelectorAll("ul.list.clearfix a")];

    return links.map((a, i) => ({
      chapter_title: a.textContent.trim(),
      chapter_url: a.href,
      chapter_number: i + 1,
    }));
  },

  // Lấy nội dung chương (1 chương = 1 URL)
  async fetchContent(chapterUrl) {
    const resp = await fetch(chapterUrl, {
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

    // Title chương nằm trong h1.article-title#nr_title
    const chapterTitle =
      doc.querySelector("h1.article-title#nr_title")?.textContent.trim() ||
      null;

    // Nội dung chương nằm trong #text p
    const contentNodes = [...doc.querySelectorAll("#text p")];
    const paragraphs = contentNodes
      .map((p) => p.textContent.trim())
      .filter((t) => t.length > 0);

    return {
      chapter_title: chapterTitle,
      chapter_url: chapterUrl,
      content: paragraphs.join("\n\n") || null,
    };
  },
};
