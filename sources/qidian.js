const SourceQidian = {
  name: "qidian",
  pattern: /^https?:\/\/(www\.)?qidian\.com\/book\/\d+\/?$/,
  downloadDelay: 1500,

  _headers() {
    return {
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9",
      "Referer": "https://www.qidian.com/",
      "User-Agent": navigator.userAgent,
    };
  },

  async _fetch(url, retries = 3) {
    for (let i = 0; i < retries; i++) {
      const resp = await fetch(url, {
        headers: this._headers(),
        credentials: "include",
      });
      if (resp.ok) return resp;
      if (resp.status === 403 || resp.status === 429 || resp.status === 503) {
        if (i === retries - 1) throw new Error(`HTTP ${resp.status}: ${url}`);
        await new Promise(r => setTimeout(r, (i + 1) * 10000));
        continue;
      }
      throw new Error(`HTTP ${resp.status}: ${url}`);
    }
  },

  async fetchPreview(url) {
    const resp = await this._fetch(url);
    const html = await resp.text();

    if (html.includes("Just a moment") || html.includes("cf-challenge"))
      throw new Error("CAPTCHA_REQUIRED");

    const doc = new DOMParser().parseFromString(html, "text/html");
    const bookId = url.match(/\/book\/(\d+)/)?.[1];

    const nameEl = doc.querySelector("h1.book-name")
                || doc.querySelector(".book-info h1")
                || doc.querySelector("h1");

    const authorEl = doc.querySelector("a.author-name")
                  || doc.querySelector(".author-name");

    const imgEl = doc.querySelector("#bookImg img")
               || doc.querySelector(".book-cover img")
               || doc.querySelector("img[class*='cover']");

    const rawSrc = imgEl?.getAttribute("src") || imgEl?.getAttribute("data-src") || null;
    const coverImage = rawSrc?.startsWith("//") ? `https:${rawSrc}` : rawSrc;

    const descEl = doc.querySelector(".book-intro p")
                || doc.querySelector("[class*='intro'] p");

    return {
      bookName: nameEl?.textContent.trim() || null,
      authorName: authorEl?.textContent.trim() || null,
      coverImage,
      sourceBookCode: bookId || null,
      url,
      description: descEl?.textContent.trim().slice(0, 200) || null,
    };
  },

  // Trả về { chapters, stats }
  // chapters: mảng gồm free + vip đã mua + vip chưa mua (để giữ số thứ tự)
  // stats: { free, purchased, unpurchased }
  async fetchChapters(bookUrl) {
    const resp = await this._fetch(bookUrl);
    const html = await resp.text();

    if (html.includes("Just a moment")) throw new Error("CAPTCHA_REQUIRED");

    const doc = new DOMParser().parseFromString(html, "text/html");

    const chapters = [];
    let chapterNumber = 1;
    let stats = { free: 0, purchased: 0, unpurchased: 0 };

    // ── div:nth-child(1): FREE chapters ──────────────────────────
    const freeDiv = doc.querySelector("#allCatalog > div:nth-child(1)");
    if (freeDiv) {
      for (const li of freeDiv.querySelectorAll("ul > li")) {
        const a = li.querySelector("a");
        if (!a) continue;
        const href = a.getAttribute("href");
        const title = a.textContent.trim();
        if (!href || !title) continue;

        const fullUrl = _normalizeQidianUrl(href);
        chapters.push({
          chapter_number: chapterNumber++,
          chapter_title: title,
          chapter_url: fullUrl,
          vip: false,
          purchased: true, // free = luôn readable
        });
        stats.free++;
      }
    }

    // ── div:nth-child(2): VIP chapters ───────────────────────────
    const vipDiv = doc.querySelector("#allCatalog > div:nth-child(2)");
    if (vipDiv) {
      for (const li of vipDiv.querySelectorAll("ul > li")) {
        const a = li.querySelector("a");
        if (!a) continue;
        const href = a.getAttribute("href");
        const title = a.textContent.trim();
        if (!href || !title) continue;

        // Có thẻ <em> → chưa mua
        const hasBadge = !!li.querySelector("em");
        const fullUrl = _normalizeQidianUrl(href);

        if (hasBadge) {
          // Chưa mua → vẫn đưa vào list để giữ số thứ tự, đánh dấu unpurchased
          chapters.push({
            chapter_number: chapterNumber++,
            chapter_title: title,
            chapter_url: fullUrl,
            vip: true,
            purchased: false,
          });
          stats.unpurchased++;
        } else {
          // Đã mua → mở tab để lấy content
          chapters.push({
            chapter_number: chapterNumber++,
            chapter_title: title,
            chapter_url: fullUrl,
            vip: true,
            purchased: true,
          });
          stats.purchased++;
        }
      }
    }

    if (chapters.length === 0) throw new Error("Không lấy được danh sách chapter");

    return { chapters, stats };
  },

  // Lấy content chapter FREE qua fetch bình thường
  async fetchContent(chapterUrl) {
    const fixedUrl = chapterUrl.startsWith("//")
      ? `https:${chapterUrl}`
      : chapterUrl;

    const resp = await this._fetch(fixedUrl);
    const html = await resp.text();

    if (html.includes("Just a moment")) throw new Error("CAPTCHA_REQUIRED");

    const doc = new DOMParser().parseFromString(html, "text/html");

    const titleEl = doc.querySelector("h3.j_chapterName")
                 || doc.querySelector("[class*='chapter-name']")
                 || doc.querySelector("h1");

    let paragraphs = [];

    const contentDiv = doc.querySelector("[id^='c-']");
    if (contentDiv) {
      const spans = contentDiv.querySelectorAll("p span.content-text");
      if (spans.length > 0) {
        paragraphs = [...spans].map(s => s.textContent.trim()).filter(t => t.length > 0);
      } else {
        paragraphs = [...contentDiv.querySelectorAll("p")]
          .map(p => p.textContent.trim())
          .filter(t => t.length > 0);
      }
    }

    if (paragraphs.length === 0) {
      const ps = doc.querySelectorAll(".read-content p, .chapter-content p");
      paragraphs = [...ps].map(p => p.textContent.trim()).filter(t => t.length > 0);
    }

    if (paragraphs.length === 0) throw new Error("Không lấy được nội dung");

    return {
      chapter_title: titleEl?.textContent.trim() || null,
      chapter_url: fixedUrl,
      content: paragraphs.join("\n\n"),
    };
  },

  // Lấy content chapter VIP đã mua qua tab (gọi background.js)
  async fetchContentViaTab(chapterUrl) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { action: "qidian_fetch_vip", url: chapterUrl },
        (response) => {
          if (chrome.runtime.lastError)
            return reject(new Error(chrome.runtime.lastError.message));
          if (response?.success)
            resolve(response.data);
          else
            reject(new Error(response?.error || "Lỗi không xác định"));
        }
      );
    });
  },
};

// ── Helper ───────────────────────────────────────────────
function _normalizeQidianUrl(href) {
  if (href.startsWith("http")) return href;
  if (href.startsWith("//")) return `https:${href}`;
  return `https://www.qidian.com/${href.replace(/^\//, "")}`;
}