document.addEventListener('DOMContentLoaded', () => {
  const cvs = document.getElementById('stats-chart');
  const tabBtn = document.querySelector('.tab-btn[data-target="stats"]');
  const toggles = document.querySelectorAll('.toggle-btn');
  if (!cvs || !tabBtn || toggles.length === 0) return;

  const series = JSON.parse(cvs.dataset.series || '[]');
  const totals = JSON.parse(cvs.dataset.total || '{}');

  if (!series.length) return;

  const labels = series.map(d => d.date);
  const uploads = series.map(d => d.upload);
  const deletions = series.map(d => d.delete);
  const successes = series.map(d => d.success);

  const pieLabels = ['Uploads', 'Deletions', 'Errors'];
  const pieData = [
    totals.uploads || 0,
    totals.deletions || 0,
    totals.errors || 0
  ];

  let chart = null;

  function resizeChartArea() {
    const area = cvs.parentElement;
    if (!area) return;
    const gap = 20;
    const top = area.getBoundingClientRect().top;
    const h = Math.max(window.innerHeight - top - gap, 300);
    area.style.height = `${h}px`;
    if (chart) chart.resize();
  }
  window.addEventListener('resize', resizeChartArea);

  function build(type) {
    if (chart) chart.destroy();

    if (type === 'pie') {
      chart = new Chart(cvs, {
        type: 'pie',
        data: {
          labels: pieLabels,
          datasets: [{ data: pieData }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { labels: { color: '#d7dee5' } } }
        }
      });
    } else {
      chart = new Chart(cvs, {
        type,
        data: {
          labels,
          datasets: [
            { label: 'Uploads', data: uploads, tension: 0.25 },
            { label: 'Deletions', data: deletions, tension: 0.25 },
            { label: 'Successes', data: successes, tension: 0.25 }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { labels: { color: '#d7dee5' } } },
          scales: {
            x: {
              ticks: { color: '#d7dee5' },
              grid: { color: 'rgba(72,82,96,0.2)' }
            },
            y: {
              beginAtZero: true,
              ticks: { color: '#d7dee5' },
              grid: { color: 'rgba(72,82,96,0.2)' }
            }
          }
        }
      });
    }

    resizeChartArea();
  }

  toggles.forEach(btn => {
    btn.addEventListener('click', () => {
      toggles.forEach(b => b.classList.toggle('active', b === btn));
      build(btn.dataset.type);
    });
  });

  function initIfNeeded() {
    if (chart) return;
    build('line');
  }

  if (tabBtn.classList.contains('active')) {
    initIfNeeded();
  } else {
    tabBtn.addEventListener('click', () => {
      requestAnimationFrame(initIfNeeded);
    }, { once: true });
  }
});
