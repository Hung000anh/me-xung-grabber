// sources/22biqu.js
// Port từ site_22biqu.py (FastAPI server) sang JS extension

const Source22biqu = {
  name: "22biqu",
  pattern: /^https?:\/\/www\.22biqu\.com\/biqu\d+\/?$/,

  async fetchPreview(url) {
    const resp = await fetch(url, {
      headers: {
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        "Referer": "https://www.22biqu.com/",
        "Cache-Control": "no-cache",
      }
    });

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const html = await resp.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    // source_book_code từ URL: /biqu101598/ → "biqu101598"
    const codeMatch = url.match(/(biqu\d+)/);
    const sourceBookCode = codeMatch ? codeMatch[1] : null;

    // Tên sách
    const bookNameEl = doc.querySelector(
      "body > div.container > div.row.row-detail > div > div > div.info > div.top > h1"
    );

    // Tác giả
    const authorEl = doc.querySelector(
      "body > div.container > div.row.row-detail > div > div > div.info > div.top > div > p:nth-child(1)"
    );
    let authorName = authorEl?.textContent.trim() || null;
    if (authorName) {
      // Bỏ prefix "作者："
      authorName = authorName.replace(/^作\s*者：/, "").trim();
    }

    // Cover
    const coverEl = doc.querySelector(
      "body > div.container > div.row.row-detail > div > div > div.imgbox > img"
    );
    const coverImage = coverEl?.getAttribute("src") || coverEl?.getAttribute("data-src") || null;

    // Mô tả
    const descEl = doc.querySelector(".introduce") || doc.querySelector(".desc") || doc.querySelector("[class*='intro']");

    return {
      bookName: bookNameEl?.textContent.trim() || null,
      authorName,
      coverImage,
      sourceBookCode,
      url,
      description: descEl?.textContent.trim().slice(0, 200) || null,
    };
  },

  async fetchChapters(bookUrl) {
    const chapters = [];
    let currentUrl = bookUrl;
    let chapterNumber = 1;

    while (true) {
      const resp = await fetch(currentUrl, {
        headers: {
          "Accept": "text/html,application/xhtml+xml",
          "Accept-Language": "zh-CN,zh;q=0.9",
          "Referer": "https://www.22biqu.com/",
        }
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const html = await resp.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");

      // Lấy danh sách chapter theo selector từ Python
      const links = doc.querySelectorAll(
        "body > div.container > div.row.row-section > " +
        "div.layout.layout-col1 > div.section-box:nth-of-type(2) " +
        "> ul.section-list.fix > li > a"
      );

      for (const a of links) {
        const href = a.getAttribute("href");
        const title = a.textContent.trim();
        if (!href || !title) continue;

        chapters.push({
          chapter_number: chapterNumber++,
          chapter_title: title,
          chapter_url: new URL(href, currentUrl).href,
        });
      }

      // Nút chuyển trang tiếp theo
      const nextBtn = doc.querySelector(
        "body > div.container > div.row.row-section > " +
        "div.layout.layout-col1 > div.index-container > a:nth-child(3)"
      );

      const nextHref = nextBtn?.getAttribute("href");
      if (!nextHref || nextHref === "javascript:void(0);") break;

      currentUrl = new URL(nextHref, currentUrl).href;

      // Tránh loop vô hạn
      await new Promise(r => setTimeout(r, 300));
    }

    return chapters;
  },

  async fetchContent(chapterUrl) {
    const contents = [];
    let currentUrl = chapterUrl;
    let chapterTitle = null;

    while (true) {
      const resp = await fetch(currentUrl, {
        headers: {
          "Accept": "text/html,application/xhtml+xml",
          "Accept-Language": "zh-CN,zh;q=0.9",
          "Referer": "https://www.22biqu.com/",
        }
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const html = await resp.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");

      // Title chỉ lấy ở trang đầu
      if (chapterTitle === null) {
        const h1 = doc.querySelector("#container > div > div > div.reader-main > h1");
        chapterTitle = h1?.textContent.trim() || null;
      }

      // Nội dung
      const contentDiv = doc.querySelector("#content");
      if (contentDiv) {
        for (const p of contentDiv.querySelectorAll("p")) {
          const text = p.textContent.trim();
          if (text) contents.push(text);
        }
      }

      // Kiểm tra next page trong cùng chapter
      const nextLink = doc.querySelector("#next_url");
      if (!nextLink) break;

      const nextText = nextLink.textContent.trim();
      const nextHref = nextLink.getAttribute("href");

      // "下一章" = chương tiếp → dừng
      // "下一页" = trang tiếp trong cùng chương → tiếp tục
      if (nextText === "下一页" && nextHref) {
        currentUrl = new URL(nextHref, currentUrl).href;
        await new Promise(r => setTimeout(r, 300));
      } else {
        break;
      }
    }

    return {
      chapter_title: chapterTitle,
      chapter_url: chapterUrl,
      content: contents.join("\n\n") || null,
    };
  }
};