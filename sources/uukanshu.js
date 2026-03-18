// sources/uukanshu.js

const SourceUukanshu = {
  name: "uukanshu",
  pattern: /^https?:\/\/uukanshu\.cc\/book\/\d+\/?$/,
  downloadDelay: 2000, // 2s giữa các chapter — tránh bị 403

  _headers() {
    return {
      "Accept": "text/html,application/xhtml+xml",
      "Accept-Language": "zh-CN,zh;q=0.9",
      "Referer": "https://uukanshu.cc/",
    };
  },

  // Fetch với retry + backoff dài khi bị 403/429/503
  async _fetch(url, retries = 4) {
    for (let i = 0; i < retries; i++) {
      const resp = await fetch(url, { headers: this._headers() });

      if (resp.ok) return resp;

      if (resp.status === 403 || resp.status === 429 || resp.status === 503) {
        if (i === retries - 1) throw new Error(`HTTP ${resp.status}: ${url}`);
        // Backoff: 10s, 20s, 30s
        const wait = (i + 1) * 10000;
        console.warn(`[uukanshu] HTTP ${resp.status}, chờ ${wait/1000}s rồi thử lại (${i+1}/${retries-1})...`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }

      throw new Error(`HTTP ${resp.status}: ${url}`);
    }
  },

  async fetchPreview(url) {
    const resp = await this._fetch(url);
    const html = await resp.text();

    if (html.includes("Just a moment") || html.includes("cf-challenge")) {
      throw new Error("CAPTCHA_REQUIRED");
    }

    const doc = new DOMParser().parseFromString(html, "text/html");

    const bookTag = doc.querySelector("div.bookinfo h1")
                 || doc.querySelector("h1");
    const authorTag = doc.querySelector("div.bookinfo p.booktag a")
                   || doc.querySelector("p.booktag a");
    const imgTag = doc.querySelector("div.bookcover img")
                || doc.querySelector(".hidden-xs img");
    const descTag = doc.querySelector(".intro")
                 || doc.querySelector(".describe")
                 || doc.querySelector("[class*='intro']");
    const m = url.match(/\/book\/(\d+)/);

    return {
      bookName: bookTag?.textContent.trim() || null,
      authorName: authorTag?.textContent.trim() || null,
      coverImage: imgTag?.getAttribute("src") || null,
      sourceBookCode: m ? m[1] : null,
      url,
      description: descTag?.textContent.trim().slice(0, 200) || null,
    };
  },

  async fetchChapters(bookUrl) {
    const resp = await this._fetch(bookUrl);
    const html = await resp.text();
    const doc = new DOMParser().parseFromString(html, "text/html");

    // Thử nhiều selector khác nhau
    const selectors = [
      "#list-chapterAll > div > dd > a",
      "#list-chapterAll dd a",
      ".chapter-list a",
      "#chapterList a",
    ];

    let elements = [];
    for (const sel of selectors) {
      elements = [...doc.querySelectorAll(sel)];
      if (elements.length > 0) break;
    }

    if (elements.length === 0) throw new Error("Không tìm thấy danh sách chapter");

    return elements
      .map((el, i) => {
        const href = el.getAttribute("href");
        const title = el.textContent.trim();
        if (!href) return null;
        return {
          chapter_number: i + 1,
          chapter_title: title || `Chapter ${i + 1}`,
          chapter_url: href.startsWith("/") ? `https://uukanshu.cc${href}` : href,
        };
      })
      .filter(Boolean);
  },

  async fetchContent(chapterUrl) {
    const resp = await this._fetch(chapterUrl);
    const html = await resp.text();
    const doc = new DOMParser().parseFromString(html, "text/html");

    // Title: thử nhiều selector
    const titleEl = doc.querySelector("div.reader-main h1")
                 || doc.querySelector(".readcontent h1")
                 || doc.querySelector("div.content h1")
                 || doc.querySelector("h1");

    // Content: thử nhiều selector — uukanshu hay đổi class
    const contentSelectors = [
      "div.readcotent",   // lỗi chính tả gốc của site
      "div.readcontent",
      "div#content",
      "div.content-body",
      "article.chapter",
      ".chapter-content",
    ];

    let contentEl = null;
    for (const sel of contentSelectors) {
      contentEl = doc.querySelector(sel);
      if (contentEl) break;
    }

    // Fallback cuối: div có nhiều text nhất (>500 chars)
    if (!contentEl) {
      let maxLen = 500;
      for (const div of doc.querySelectorAll("div")) {
        const len = div.textContent.trim().length;
        if (len > maxLen && div.querySelectorAll("div").length < 5) {
          maxLen = len;
          contentEl = div;
        }
      }
    }

    if (!contentEl) {
      throw new Error(`Không tìm thấy nội dung: ${chapterUrl}`);
    }

    // Xóa script, style, nav buttons
    contentEl.querySelectorAll("script, style, .readtool, .chapter-nav, a").forEach(el => el.remove());

    // Lấy text — uukanshu dùng <p> hoặc <br> tùy chapter
    let paragraphs = [...contentEl.querySelectorAll("p")]
      .map(p => p.textContent.trim())
      .filter(t => t.length > 0);

    if (paragraphs.length === 0) {
      // Fallback: dùng innerText với <br>
      contentEl.querySelectorAll("br").forEach(br => br.replaceWith("\n"));
      paragraphs = contentEl.textContent
        .split("\n")
        .map(s => s.trim())
        .filter(s => s.length > 0);
    }

    if (paragraphs.length === 0) {
      throw new Error(`Nội dung trống: ${chapterUrl}`);
    }

    return {
      chapter_title: titleEl?.textContent.trim() || null,
      chapter_url: chapterUrl,
      content: paragraphs.join("\n\n"),
    };
  },
};