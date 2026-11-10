/* ============================================================
   吴都鄂州 · 交互引擎
   功能：① 详情弹窗（区划/景区/美食/历史/机场/数据）
        ② 图片灯箱（点击放大、缩放、键盘操作）
        ③ 大型区块自动可点击
   安全约定：所有动态文本一律通过 textContent 赋值注入，
            不使用 innerHTML 拼接用户/数据内容，避免转义与注入问题。
   SECTION: util   —— 工具函数
   SECTION: modal  —— 详情弹窗
   SECTION: render —— 数据渲染
   SECTION: light  —— 图片灯箱
   SECTION: bind   —— 页面绑定与自动增强
   ============================================================ */

(function () {
  'use strict';

  /* SECTION: util */
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) { n.className = cls; }
    if (text !== undefined && text !== null) { n.textContent = text; }
    return n;
  }

  function imgEl(src, alt, cls) {
    var i = document.createElement('img');
    if (cls) { i.className = cls; }
    i.alt = alt || '';
    i.loading = 'lazy';
    i.decoding = 'async';
    // 属性赋值注入 src，不经模板拼接
    i.src = src;
    return i;
  }

  function lockScroll(on) {
    document.documentElement.style.overflow = on ? 'hidden' : '';
  }

  /* 数据文件中的图片路径统一以站点根目录为基准（形如 image/xx.jpg）。
     主页在根目录、分页面在 web/ 下，需按当前页面所在层级换算相对路径。
     判定依据：本脚本固定位于 web/js/app.js，
     主页引用为 "web/js/app.js"（深度 2，无需上跳），
     分页面引用为 "js/app.js"（深度 1，需上跳一级）。 */
  var IMG_PREFIX = (function () {
    var s = document.querySelector('script[src*="app.js"]');
    if (!s) { return ''; }
    var src = s.getAttribute('src') || '';
    var depth = src.split('/').length - 1;
    var ups = 2 - depth;
    var p = '';
    for (var i = 0; i < ups; i++) { p += '../'; }
    return p;
  })();

  function resolveImg(path) {
    if (!path) { return path; }
    if (/^(https?:)?\/\//i.test(path) || path.charAt(0) === '/') { return path; }
    if (path.indexOf('../') === 0) { return path; }
    return IMG_PREFIX + path;
  }

  function trapFocus(container) {
    var sel = 'a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])';
    function handler(e) {
      if (e.key !== 'Tab') { return; }
      var items = container.querySelectorAll(sel);
      if (!items.length) { return; }
      var first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    container.addEventListener('keydown', handler);
    return function () { container.removeEventListener('keydown', handler); };
  }

  /* SECTION: modal */
  var openStack = [];

  function closeModal(node) {
    if (!node || !node.parentNode) { return; }
    node.classList.add('closing');
    var cleanup = node._cleanupFocus;
    var prev = node._prevFocus;
    setTimeout(function () {
      if (node.parentNode) { node.parentNode.removeChild(node); }
      if (cleanup) { cleanup(); }
      var idx = openStack.indexOf(node);
      if (idx > -1) { openStack.splice(idx, 1); }
      if (!openStack.length) { lockScroll(false); }
      if (prev && prev.focus) { try { prev.focus(); } catch (e) { /* 忽略 */ } }
    }, 200);
  }

  function openModal(build) {
    var overlay = el('div', 'modal-overlay');
    var dialog = el('div', 'modal');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');

    var closeBtn = el('button', 'modal-close');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', '关闭详情');
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', function () { closeModal(overlay); });

    var body = el('div', 'modal-body');
    build(body);

    dialog.appendChild(closeBtn);
    dialog.appendChild(body);
    overlay.appendChild(dialog);

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) { closeModal(overlay); }
    });

    function onKey(e) {
      if (e.key === 'Escape') { e.stopPropagation(); closeModal(overlay); }
    }
    overlay.addEventListener('keydown', onKey);

    overlay._prevFocus = document.activeElement;
    overlay._cleanupFocus = trapFocus(dialog);

    if (!openStack.length) { lockScroll(true); }
    openStack.push(overlay);
    document.body.appendChild(overlay);
    // 强制回流后再加显示类，触发过渡动画
    void overlay.offsetWidth;
    overlay.classList.add('show');
    closeBtn.focus();
    return overlay;
  }

  /* SECTION: render */
  function renderTags(container, tags) {
    if (!tags || !tags.length) { return; }
    var palette = ['', 'g', 'o', 'p', 'v', 'y'];
    var ul = el('ul', 'tags');
    tags.forEach(function (t, i) {
      var li = el('li');
      var span = el('span', 'tag' + (palette[i % palette.length] ? ' ' + palette[i % palette.length] : ''));
      span.textContent = t;
      li.appendChild(span);
      ul.appendChild(li);
    });
    container.appendChild(ul);
  }

  function renderStats(container, stats) {
    if (!stats || !stats.length) { return; }
    var box = el('div', 'md-stats');
    stats.forEach(function (s) {
      var item = el('div', 'md-stat');
      var v = el('b');
      v.textContent = s.v;
      var k = el('span');
      k.textContent = s.k;
      item.appendChild(v);
      item.appendChild(k);
      box.appendChild(item);
    });
    container.appendChild(box);
  }

  function renderSections(container, sections) {
    if (!sections || !sections.length) { return; }
    sections.forEach(function (sec) {
      var block = el('div', 'md-sec');
      if (sec.h) { block.appendChild(el('h4', 'md-h', sec.h)); }
      if (sec.p) { block.appendChild(el('p', null, sec.p)); }
      if (sec.list && sec.list.length) {
        var ul = el('ul', 'md-list');
        sec.list.forEach(function (li) { ul.appendChild(el('li', null, li)); });
        block.appendChild(ul);
      }
      container.appendChild(block);
    });
  }

  // 渲染一条详情记录到弹窗
  function renderDetail(body, rec, collection) {
    body.appendChild(el('div', 'md-kicker', collectionLabel(collection)));

    if (rec.image) {
      var resolved = resolveImg(rec.image);
      var fig = el('figure', 'md-figure');
      var img = imgEl(resolved, rec.imageAlt || rec.title, 'md-img');
      img.dataset.zoom = resolved;
      img.dataset.zoomAlt = rec.imageAlt || rec.title;
      img.style.cursor = 'zoom-in';
      img.setAttribute('title', '点击放大查看');
      fig.appendChild(img);
      body.appendChild(fig);
    }

    body.appendChild(el('h3', 'md-title', rec.title));
    renderTags(body, rec.tags);
    if (rec.intro) { body.appendChild(el('p', 'md-intro', rec.intro)); }
    renderStats(body, rec.stats);
    renderSections(body, rec.sections);
  }

  function collectionLabel(c) {
    var map = {
      districts: '行政区划 · 详情',
      spots: '景点风光 · 详情',
      foods: '舌尖鄂州 · 详情',
      history: '吴都历史 · 详情',
      people: '历史名人 · 详情',
      airport: '花湖机场 · 详情',
      economy: '城市数据 · 详情'
    };
    return map[c] || '详情';
  }

  function showDetail(collection, index) {
    var data = window.EZ_DATA;
    if (!data || !data[collection]) { return; }
    var rec = data[collection][index];
    if (!rec) { return; }
    var list = data[collection];
    openModal(function (body) {
      renderDetail(body, rec, collection);
      // 上一条 / 下一条
      var nav = el('div', 'md-nav');
      var prev = el('button', 'btn btn-ghost md-navbtn');
      prev.type = 'button';
      prev.textContent = '← 上一条';
      prev.disabled = index === 0;
      prev.addEventListener('click', function () {
        closeModal(body.closest('.modal-overlay'));
        showDetail(collection, index - 1);
      });
      var next = el('button', 'btn btn-ghost md-navbtn');
      next.type = 'button';
      next.textContent = '下一条 →';
      next.disabled = index === list.length - 1;
      next.addEventListener('click', function () {
        closeModal(body.closest('.modal-overlay'));
        showDetail(collection, index + 1);
      });
      var counter = el('span', 'md-counter');
      counter.textContent = (index + 1) + ' / ' + list.length;
      nav.appendChild(prev);
      nav.appendChild(counter);
      nav.appendChild(next);
      body.appendChild(nav);
    });
  }

  /* SECTION: light */
  var lightbox = null;

  function openLightbox(src, alt, startScale) {
    if (lightbox) { closeLightbox(); }
    var ov = el('div', 'lb-overlay');
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-label', '图片放大查看');

    var fig = el('figure', 'lb-fig');
    var img = el('img', 'lb-img');
    img.alt = alt || '';
    img.src = src;
    var scale = startScale || 1;
    img.style.transform = 'scale(' + scale + ')';
    fig.appendChild(img);

    var cap = el('figcaption', 'lb-cap', alt || '');
    fig.appendChild(cap);

    // 工具条
    var bar = el('div', 'lb-bar');
    var pct = el('span', 'lb-pct', '100%');

    function apply() {
      img.style.transform = 'scale(' + scale + ')';
      pct.textContent = Math.round(scale * 100) + '%';
    }
    function mkBtn(label, aria, fn) {
      var b = el('button', 'lb-btn');
      b.type = 'button';
      b.textContent = label;
      b.setAttribute('aria-label', aria);
      b.addEventListener('click', function (e) { e.stopPropagation(); fn(); });
      bar.appendChild(b);
      return b;
    }
    mkBtn('－', '缩小', function () { scale = Math.max(0.5, scale - 0.25); apply(); });
    bar.appendChild(pct);
    mkBtn('＋', '放大', function () { scale = Math.min(4, scale + 0.25); apply(); });
    mkBtn('1:1', '重置缩放', function () { scale = 1; apply(); });
    var closeB = mkBtn('×', '关闭图片', function () { closeLightbox(); });
    closeB.classList.add('lb-closebtn');

    var hint = el('div', 'lb-hint', '滚轮或 ＋／－ 缩放 · Esc 或点击空白处关闭');

    ov.appendChild(fig);
    ov.appendChild(bar);
    ov.appendChild(hint);

    ov.addEventListener('click', function (e) {
      if (e.target === ov || e.target === fig) { closeLightbox(); }
    });
    // 双击图片切换放大/还原
    img.addEventListener('dblclick', function (e) {
      e.stopPropagation();
      scale = scale > 1 ? 1 : 2;
      apply();
    });
    // 滚轮缩放
    ov.addEventListener('wheel', function (e) {
      e.preventDefault();
      var d = e.deltaY > 0 ? -0.15 : 0.15;
      scale = Math.min(4, Math.max(0.5, scale + d));
      apply();
    }, { passive: false });

    function onKey(e) {
      if (e.key === 'Escape') { e.stopPropagation(); closeLightbox(); }
      else if (e.key === '+' || e.key === '=') { scale = Math.min(4, scale + 0.25); apply(); }
      else if (e.key === '-' || e.key === '_') { scale = Math.max(0.5, scale - 0.25); apply(); }
      else if (e.key === '0') { scale = 1; apply(); }
    }
    ov.addEventListener('keydown', onKey);
    ov._onKey = onKey;
    ov._prevFocus = document.activeElement;

    lightbox = ov;
    document.body.appendChild(ov);
    void ov.offsetWidth;
    ov.classList.add('show');
    apply();
    closeB.focus();
  }

  function closeLightbox() {
    if (!lightbox) { return; }
    var ov = lightbox;
    lightbox = null;
    ov.classList.add('closing');
    setTimeout(function () {
      if (ov.parentNode) { ov.parentNode.removeChild(ov); }
      if (!openStack.length) { lockScroll(false); }
      if (ov._prevFocus && ov._prevFocus.focus) { try { ov._prevFocus.focus(); } catch (e) { /* 忽略 */ } }
    }, 200);
  }

  /* SECTION: bind */

  // 图片灯箱：为页面内所有可放大图片绑定
  function bindZoomImages(root) {
    var scope = root || document;
    var imgs = scope.querySelectorAll('img[data-zoom], .card-art img, .hero-art img, .md-img');
    Array.prototype.forEach.call(imgs, function (img) {
      if (img._zoomBound) { return; }
      img._zoomBound = true;
      img.style.cursor = 'zoom-in';
      img.setAttribute('title', '点击放大查看');
      img.addEventListener('click', function (e) {
        // 若图片位于可点击卡片内，阻止冒泡以免同时触发卡片弹窗
        e.stopPropagation();
        var src = img.dataset.zoom || img.getAttribute('src');
        openLightbox(src, img.alt || '');
      });
    });
  }

  // 区块可点击：data-detail="collection:index"
  function bindDetailBlocks(root) {
    var scope = root || document;
    var nodes = scope.querySelectorAll('[data-detail]');
    Array.prototype.forEach.call(nodes, function (node) {
      if (node._detailBound) { return; }
      node._detailBound = true;
      var spec = node.getAttribute('data-detail') || '';
      var parts = spec.split(':');
      var collection = parts[0];
      var index = parseInt(parts[1], 10);
      if (!collection || isNaN(index)) { return; }

      node.classList.add('clickable');
      node.setAttribute('role', 'button');
      node.setAttribute('tabindex', '0');
      var title = node.getAttribute('data-detail-title') || '查看详情';
      node.setAttribute('aria-label', title + '（按回车查看详情）');

      // 视觉提示角标。
      // 表格行 <tr> 内不能直接放 <span>（非法结构，浏览器会自动搬移），
      // 因此对 <tr> 把提示插入其最后一个单元格内。
      // 双栏区块（.split）是网格容器，直接追加会成为第三个网格项而错位，
      // 因此把提示放进第二栏（文字栏）末尾。
      if (!node.querySelector('.click-hint')) {
        var hint = el('span', 'click-hint', '点击查看详情 →');
        var tag = node.tagName ? node.tagName.toLowerCase() : '';
        if (tag === 'tr') {
          var cells = node.querySelectorAll('td,th');
          if (cells.length) { cells[cells.length - 1].appendChild(hint); }
        } else if (node.classList.contains('split')) {
          var cols = node.children;
          var host = cols.length > 1 ? cols[1] : node;
          host.appendChild(hint);
        } else {
          node.appendChild(hint);
        }
      }

      // 区块内若含链接、按钮等可交互元素，点击它们时不触发弹窗，
      // 以免"点按钮跳转"与"打开详情"同时发生。
      function isInteractive(target) {
        if (!target || !target.closest) { return false; }
        return !!target.closest('a, button, input, select, textarea, label, img');
      }

      function fire(e) {
        if (isInteractive(e && e.target)) { return; }
        showDetail(collection, index);
      }
      node.addEventListener('click', fire);
      node.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fire(e); }
      });
    });
  }

  // 全局 Esc：灯箱优先于弹窗
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && lightbox) {
      e.stopPropagation();
      closeLightbox();
    }
  }, true);

  function init() {
    bindDetailBlocks(document);
    bindZoomImages(document);
    // 弹窗内动态插入的图片也需绑定
    var observer = null;
    if (window.MutationObserver) {
      observer = new MutationObserver(function (muts) {
        muts.forEach(function (m) {
          Array.prototype.forEach.call(m.addedNodes, function (n) {
            if (n.nodeType !== 1) { return; }
            bindZoomImages(n);
            bindDetailBlocks(n);
          });
        });
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
    return observer;
  }

  // 暴露给页面按需调用
  window.EZ = {
    showDetail: showDetail,
    openLightbox: openLightbox,
    closeLightbox: closeLightbox,
    bindZoomImages: bindZoomImages,
    bindDetailBlocks: bindDetailBlocks,
    init: init
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
