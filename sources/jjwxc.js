// sources/jjwxc.js
// jjwxc.net — encoding GB2312, content dùng <br> không dùng <p>

const SourceJjwxc = {
  name: "jjwxc",
  pattern: /^https?:\/\/(www\.)?jjwxc\.net\/onebook\.php\?novelid=\d+$/,

  _headers() {
    return {
      "Accept": "text/html,application/xhtml+xml",
      "Accept-Language": "zh-CN,zh;q=0.9",
      "Referer": "https://www.jjwxc.net/",
    };
  },

  async _fetchGB(url) {
    console.log("[jjwxc] fetching:", url);
    let resp;
    try {
      resp = await fetch(url, { headers: this._headers() });
    } catch (err) {
      console.error("[jjwxc] fetch threw:", err.message, err);
      throw err;
    }
    console.log("[jjwxc] status:", resp.status, resp.statusText);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${url}`);
    const buffer = await resp.arrayBuffer();
    const html = new TextDecoder("gbk").decode(buffer);
    console.log("[jjwxc] html length:", html.length, "preview:", html.slice(0, 300));
    return html;
  },

  async fetchPreview(url) {
    const html = await this._fetchGB(url);
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    const novelId = url.match(/novelid=(\d+)/)?.[1];

    const authorTag = doc.querySelector("a[href*='oneauthor.php']");
    const imgTag = doc.querySelector("img[src*='novelcover']")
                || doc.querySelector("td img[width]");
    const h1 = doc.querySelector("h1");

    // Mô tả: td chứa text dài nhất trong bảng info
    let description = null;
    const tds = [...doc.querySelectorAll("td")];
    for (const td of tds) {
      const t = td.textContent.trim();
      if (t.length > 100 && t.length < 600) {
        description = t.slice(0, 200);
        break;
      }
    }

    return {
      bookName: h1?.textContent.trim() || doc.title?.split(/[_\|]/)[0]?.trim() || null,
      authorName: authorTag?.textContent.trim() || null,
      coverImage: imgTag?.getAttribute("src") || null,
      sourceBookCode: novelId || null,
      url,
      description,
    };
  },

  async fetchChapters(bookUrl) {
    const html = await this._fetchGB(bookUrl);
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    const novelId = bookUrl.match(/novelid=(\d+)/)?.[1];
    if (!novelId) throw new Error("Không lấy được novel ID");

    // Chapter links dạng: onebook.php?novelid=XXX&chapterid=N
    const links = [...doc.querySelectorAll(`a[href*='novelid=${novelId}&chapterid=']`)];

    const chapters = [];
    let chapterNumber = 1;

    for (const a of links) {
      const href = a.getAttribute("href");
      const title = a.textContent.trim();
      if (!href || !title) continue;

      // Bỏ qua VIP: row cha có text "[VIP]" hoặc link bị disable
      const row = a.closest("tr");
      if (row && row.textContent.includes("[VIP]")) continue;

      const fullUrl = (href.startsWith("http")
        ? href
        : `https://www.jjwxc.net/${href.replace(/^\//, "")}`)
        .replace(/^http:\/\//, "https://"); // force HTTPS

      chapters.push({
        chapter_number: chapterNumber++,
        chapter_title: title,
        chapter_url: fullUrl,
      });
    }

    return chapters;
  },

  async fetchContent(chapterUrl) {
    const html = await this._fetchGB(chapterUrl);
    const doc = new DOMParser().parseFromString(html, "text/html");

    const h2 = doc.querySelector("h2");
    const chapterTitle = h2?.textContent.trim() || null;

    // Content wrapper: div.novelbody > div[style*='cursor']
    const wrapper = doc.querySelector("div.novelbody div[style*='cursor']")
                 || doc.querySelector("div.novelbody");

    if (!wrapper) {
      console.warn("[jjwxc] novelbody not found");
      return { chapter_title: chapterTitle, chapter_url: chapterUrl, content: null };
    }

    // Xóa các div con không phải content (navigation, icon...)
    wrapper.querySelectorAll("div, script, style").forEach(el => el.remove());

    // Lúc này chỉ còn text nodes + <br>
    wrapper.querySelectorAll("br").forEach(br => br.replaceWith("\n"));

    const content = wrapper.textContent
      .split("\n")
      .map(s => s.trim())
      .filter(s => s.length > 0)
      .join("\n\n") || null;

    return { chapter_title: chapterTitle, chapter_url: chapterUrl, content };
  },
};