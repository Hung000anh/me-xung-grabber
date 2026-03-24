// background.js — service worker

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

  // ── Handler lấy content VIP Qidian qua tab thật ──────────────
  if (request.action === "qidian_fetch_vip") {
    _fetchQidianViaTab(request.url)
      .then(data => sendResponse({ success: true, data }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // async response
  }

});

// ── Mở tab nền, inject script, lấy content, đóng tab ────────────
async function _fetchQidianViaTab(chapterUrl) {
  let tab = null;

  try {
    // 1. Mở tab nền
    tab = await chrome.tabs.create({ url: chapterUrl, active: false });

    // 2. Đợi tab load xong (timeout 30s)
    await _waitForTab(tab.id, 30000);

    // 3. Thêm delay nhỏ để JS trang chạy xong
    await _sleep(1500);

    // 4. Inject script vào tab để lấy content
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: _extractQidianContent,
    });

    const data = results?.[0]?.result;
    if (!data) throw new Error("Không nhận được kết quả từ tab");
    if (data.error) throw new Error(data.error);

    return data;

  } finally {
    // 5. Luôn đóng tab dù thành công hay thất bại
    if (tab?.id) {
      chrome.tabs.remove(tab.id).catch(() => {});
    }
  }
}

// ── Hàm này được inject vào trang Qidian (chạy trong context trang) ──
// LƯU Ý: Hàm này KHÔNG có closure với code bên ngoài,
// không dùng được biến hay hàm nào định nghĩa ở trên
function _extractQidianContent() {
  try {
    // Lấy chapterId từ URL hiện tại của tab
    const chapterId = location.pathname.match(/\/chapter\/\d+\/(\d+)/)?.[1];

    // Tìm title
    const titleEl = document.querySelector("h3.j_chapterName")
                 || document.querySelector("[class*='chapter-name']")
                 || document.querySelector("h1");
    const title = titleEl?.textContent.trim() || null;

    // Tìm content div
    let contentDiv = null;
    if (chapterId) {
      contentDiv = document.querySelector(`#c-${chapterId}`);
    }
    // Fallback nếu không tìm được qua ID
    if (!contentDiv) {
      contentDiv = document.querySelector("[id^='c-']");
    }

    // Không tìm thấy content div → có thể chưa mua hoặc lỗi
    if (!contentDiv) {
      return { error: "Không tìm thấy nội dung chapter. Có thể chưa mua hoặc cần đăng nhập." };
    }

    // Thử lấy innerText trước (xử lý được font obfuscation tốt hơn)
    // innerText chỉ hoạt động đúng khi tab visible, nhưng thử vẫn hơn
    let paragraphs = [];

    const spans = contentDiv.querySelectorAll("p span.content-text");
    if (spans.length > 0) {
      paragraphs = [...spans]
        .map(s => (s.innerText || s.textContent).trim())
        .filter(t => t.length > 0);
    } else {
      paragraphs = [...contentDiv.querySelectorAll("p")]
        .map(p => (p.innerText || p.textContent).trim())
        .filter(t => t.length > 0);
    }

    if (paragraphs.length === 0) {
      return { error: "Content div tồn tại nhưng không có nội dung." };
    }

    return {
      chapter_title: title,
      chapter_url: location.href,
      content: paragraphs.join("\n\n"),
    };

  } catch (e) {
    return { error: e.message };
  }
}

// ── Đợi tab load xong ────────────────────────────────────────────
function _waitForTab(tabId, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.webNavigation.onCompleted.removeListener(listener);
      // Timeout nhưng vẫn resolve, để inject script thử xem sao
      resolve();
    }, timeout);

    function listener(details) {
      if (details.tabId === tabId && details.frameId === 0) {
        clearTimeout(timer);
        chrome.webNavigation.onCompleted.removeListener(listener);
        resolve();
      }
    }

    chrome.webNavigation.onCompleted.addListener(listener);
  });
}

function _sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}