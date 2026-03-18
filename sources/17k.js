// sources/17k.js
// Fetch thẳng từ popup context — MV3 + host_permissions cho phép điều này

const Source17k = {
  name: "17k",
  pattern: /^https?:\/\/www\.17k\.com\/book\/\d+\.html$/,

  async fetchPreview(url) {
    const resp = await fetch(url, {
      headers: {
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "zh-CN,zh;q=0.9",
      }
    });

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const html = await resp.text();
    if (html.includes("cf-turnstile") || html.includes("challenge-platform")) {
      throw new Error("CAPTCHA_REQUIRED");
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    const imgTag = doc.querySelector("#bookCover > a > img");
    const authorTag = doc.querySelector(
      "body > div.Main > div.bRight > div.AuthorInfo > div > a.name"
    );
    const breadcrumbTag = doc.querySelector("body > div.infoPath > div > span");
    const descTag = doc.querySelector(".introduce")
                 || doc.querySelector(".desc")
                 || doc.querySelector("[class*='intro']");

    let sourceBookCode = null;
    if (breadcrumbTag) {
      const match = breadcrumbTag.textContent.match(/\d+/);
      if (match) sourceBookCode = match[0];
    }

    return {
      bookName: imgTag?.getAttribute("alt") || null,
      authorName: authorTag?.textContent.trim() || null,
      coverImage: imgTag?.getAttribute("src") || null,
      sourceBookCode,
      url,
      description: descTag?.textContent.trim().slice(0, 200) || null,
    };
  },

  async fetchChapters(bookUrl) {
    const bookId = bookUrl.match(/\/book\/(\d+)\.html/)?.[1];
    if (!bookId) throw new Error("Không lấy được book ID");

    const listUrl = `https://www.17k.com/list/${bookId}.html`;

    const resp = await fetch(listUrl, {
      headers: {
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "zh-CN,zh;q=0.9",
        "Referer": `https://www.17k.com/book/${bookId}.html`
      }
    });

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const html = await resp.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    const links = [...doc.querySelectorAll("a[href*='/chapter/']")];

    return links
      .map((a) => {
        const href = a.getAttribute("href") || "";
        if (!href.includes(`/chapter/${bookId}/`)) return null;
        if (a.querySelector("span.ellipsis.vip")) return null;
        return {
          chapter_title: a.textContent.trim(),
          chapter_url: `https://www.17k.com${href}`
        };
      })
      .filter(Boolean)
      .map((c, i) => ({ ...c, chapter_number: i + 1 }));
  },

  async fetchContent(chapterUrl) {
    const resp = await fetch(chapterUrl, {
      headers: {
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "zh-CN,zh;q=0.9",
        "Referer": "https://www.17k.com/"
      }
    });

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const html = await resp.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    const titleTag = doc.querySelector("#readArea > div.readAreaBox.content > h1");
    const contentNodes = [...doc.querySelectorAll(
      "#readArea div.readAreaBox.content div p:not(.copy)"
    )];

    const chapterTitle = titleTag?.textContent.trim() || null;
    const paragraphs = contentNodes
      .map(p => p.textContent.trim())
      .filter(t => t.length > 0);

    return {
      chapter_title: chapterTitle,
      chapter_url: chapterUrl,
      content: paragraphs.join("\n\n") || null
    };
  }
};