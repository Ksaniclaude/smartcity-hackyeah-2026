try {
  var m = localStorage.getItem("motyw");
  if (m) document.documentElement.dataset.motyw = m;
  if (m === "jasny") document.querySelector('meta[name="theme-color"]').setAttribute("content", "#f2f4f8");
} catch (e) {}
