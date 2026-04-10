/* ── Charts ── */
        Chart.defaults.color = '#7d8590';
        Chart.defaults.borderColor = '#21262d';
        Chart.defaults.font.family = "'Inter', system-ui";

        // BO Chart — simulated improvement curve
        const boLabels = Array.from({
            length: 15
        }

            , (_, i) => `第 ${
                i + 1
            }

            輪`);
        const boData = [0.2087, 0.2087, 0.2087, 0.2087, 0.2087, 0.2087, 0.2087,
            0.2087, 0.2100, 0.2140, 0.2180, 0.2200, 0.2300, 0.2434, 0.2434];

        new Chart(document.getElementById('boChart'), {

            type: 'line',
            data: {
                labels: boLabels, datasets: [{
                    data: boData, borderColor: '#39d0f0', backgroundColor: 'rgba(57,208,240,.08)',
                    borderWidth: 2, pointRadius: 3, fill: true, tension: .3
                }

                ]
            }

            ,
            options: {

                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                }

                ,
                scales: {
                    x: {
                        grid: {
                            color: '#21262d'
                        }

                        , ticks: {
                            maxTicksLimit: 5
                        }
                    }

                    ,
                    y: {
                        grid: {
                            color: '#21262d'
                        }

                        , ticks: {
                            callback: v => v.toFixed(3)
                        }
                    }
                }
            }
        });

        // Loss Chart
        const lossLabels = Array.from({
            length: 80
        }

            , (_, i) => i + 1);

        const lossData = Array.from({
            length: 80
        }

            , (_, i) => 0.03 * Math.exp(-i * 0.06) + 0.0013 + Math.random() * .0005);

        new Chart(document.getElementById('lossChart'), {

            type: 'line',
            data: {
                labels: lossLabels, datasets: [{
                    data: lossData, borderColor: '#bc8cff', backgroundColor: 'rgba(188,140,255,.06)',
                    borderWidth: 2, pointRadius: 0, fill: true, tension: .4
                }

                ]
            }

            ,
            options: {

                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                }

                ,
                scales: {
                    x: {
                        grid: {
                            color: '#21262d'
                        }

                        , title: {
                            display: true, text: 'Epoch'
                        }
                    }

                    ,
                    y: {
                        type: 'logarithmic', grid: {
                            color: '#21262d'
                        }

                        , title: {
                            display: true, text: 'MSE Loss'
                        }
                    }
                }
            }
        });

        // RL Chart
        const rlLabels = Array.from({
            length: 25
        }

            , (_, i) => `第 ${
            i + 1
        }

        回`);

        const rlData = Array.from({
            length: 25
        }

            , (_, i) => -0.15 + i * 0.018 + (Math.random() - .5) * .04);

        new Chart(document.getElementById('rlChart'), {

            type: 'line',
            data: {
                labels: rlLabels, datasets: [{
                    data: rlData, borderColor: '#3fb950', backgroundColor: 'rgba(63,185,80,.07)',
                    borderWidth: 2, pointRadius: 3, fill: true, tension: .3
                }

                ]
            }

            ,
            options: {

                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                }

                ,
                scales: {
                    x: {
                        grid: {
                            color: '#21262d'
                        }
                    }

                    ,
                    y: {
                        grid: {
                            color: '#21262d'
                        }

                        , ticks: {
                            callback: v => v.toFixed(3)
                        }
                    }
                }
            }
        });

        // MPNN Chart
        const mpnnLabels = Array.from({
            length: 40
        }

            , (_, i) => i + 1);

        const mpnnData = Array.from({
            length: 40
        }

            , (_, i) => 3.2 * Math.exp(-i * 0.08) + 0.8 + Math.random() * .05);

        new Chart(document.getElementById('mpnnChart'), {

            type: 'line',
            data: {
                labels: mpnnLabels, datasets: [{
                    data: mpnnData, borderColor: '#f0883e', backgroundColor: 'rgba(240,136,62,.07)',
                    borderWidth: 2, pointRadius: 2, fill: true, tension: .4
                }

                ]
            }

            ,
            options: {

                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                }

                ,
                scales: {
                    x: {
                        grid: {
                            color: '#21262d'
                        }

                        , title: {
                            display: true, text: 'Step'
                        }
                    }

                    ,
                    y: {
                        grid: {
                            color: '#21262d'
                        }

                        , title: {
                            display: true, text: 'Cross-Entropy'
                        }
                    }
                }
            }
        });
