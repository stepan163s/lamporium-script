(function() {
    'use strict';
    var network = new Lampa.Request();

    function calculateProgress(total, current) {
        if(total == current) {
            Lampa.Noty.show('Обновление списка фильмов Кинориума завершено');
            if(Lampa.Storage.get('kinorium_launched_before', false) == false) {
                Lampa.Storage.set('kinorium_launched_before', true);
                Lampa.Activity.push({
                    url: '',
                    title: 'Кинориум',
                    component: 'kinorium',
                    page: 1
                });
            }
        }
    }

    function parseKinoriumHTML(html) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const movies = [];
        
        const movieElements = doc.querySelectorAll('.statusWidgetData[data-movieId]');
        
        movieElements.forEach(element => {
            const movieId = element.getAttribute('data-movieId');
            const movieName = element.getAttribute('data-movieName');
            
            const titleElement = element.querySelector('.movie-title__text');
            const russianTitle = titleElement ? titleElement.textContent.trim() : movieName;
            
            const smallElement = element.querySelector('small');
            let originalTitle = '';
            let year = '';
            
            if (smallElement) {
                const smallText = smallElement.textContent.trim();
                const lastCommaIndex = smallText.lastIndexOf(',');
                if (lastCommaIndex !== -1) {
                    originalTitle = smallText.substring(0, lastCommaIndex).trim();
                    year = smallText.substring(lastCommaIndex + 1).trim();
                } else {
                    originalTitle = smallText;
                }
            }
            
            const isSerial = element.querySelector('.status-list__serial_text') !== null;
            
            movies.push({
                kinorium_id: movieId,
                russianTitle: russianTitle,
                originalTitle: originalTitle,
                year: year,
                isSerial: isSerial,
                timestamp: element.getAttribute('data-timestamp')
            });
        });
        
        return movies;
    }

    function processKinoriumData(html) {
        const movies = parseKinoriumHTML(html);
            
        if(movies.length == 0) {
            Lampa.Noty.show('В списке "Буду смотреть" Кинориума нет фильмов');
            return;
        }

        var kinoriumMovies = Lampa.Storage.get('kinorium_movies', []);
        const receivedMovieIds = new Set(movies.map(m => String(m.kinorium_id)));
        
        kinoriumMovies = kinoriumMovies.filter(movie => receivedMovieIds.has(String(movie.kinorium_id)));
        Lampa.Storage.set('kinorium_movies', JSON.stringify(kinoriumMovies));
        
        let processedItems = 1;
        
        movies.forEach(m => {
            const existsInLocalStorage = kinoriumMovies.some(km => km.kinorium_id === String(m.kinorium_id));
            
            if (!existsInLocalStorage) {
                const movieType = m.isSerial ? 'tv' : 'movie';
                const searchTitle = m.originalTitle || m.russianTitle;
                
                var url = Lampa.Utils.protocol() + 'tmdb.'+ Lampa.Manifest.cub_domain +'/3/search/' + movieType + 
                         '?query=' + encodeURIComponent(searchTitle) + 
                         '&api_key=4ef0d7355d9ffb5151e987764708ce96' + 
                         (m.year ? '&year=' + String(m.year) : '') + 
                         '&language=ru';
                
                network.silent(url, function(data) {
                    if(data && data.results && data.results[0]) {
                        var movieItem = data.results[0];
                        
                        var movieDateStr = movieItem.release_date || movieItem.first_air_date;
                        var movieDate = new Date(movieDateStr);

                        if (movieDate <= new Date()) {                                            
                            movieItem.kinorium_id = String(m.kinorium_id);
                            movieItem.source = "tmdb";
                            kinoriumMovies = Lampa.Storage.get('kinorium_movies', []);
                            kinoriumMovies.unshift(movieItem);
                            Lampa.Storage.set('kinorium_movies', JSON.stringify(kinoriumMovies));
                        } else {
                            if (Lampa.Storage.get('kinorium_add_to_favorites', false)) {
                                Lampa.Favorite.add('wath', movieItem, 100);
                            }
                        }
                        
                    }
                    calculateProgress(movies.length, processedItems++);
                }, function(error) {
                    calculateProgress(movies.length, processedItems++);
                });
            } else {
                calculateProgress(movies.length, processedItems++);
            }
        });
    }

    function getKinoriumData() {
        var userId = Lampa.Storage.get('kinorium_user_id', '');
        
        if (!userId) {
            Lampa.Noty.show('Укажите ID пользователя Кинориума в настройках');
            return;
        }
        
        var proxyUrl = 'https://corsproxy.io/?' + encodeURIComponent('https://ru.kinorium.com/user/' + userId + '/watchlist/');
        
        network.silent(proxyUrl, function(html) {
            processKinoriumData(html);
        }, function(error) {
            Lampa.Noty.show('Ошибка при получении данных с Кинориума');
        });
    }

    function full(params, oncomplete, onerror) {
        var userId = Lampa.Storage.get('kinorium_user_id', '');
        if(userId) {
            getKinoriumData();
        }
        oncomplete({
            "secuses": true,
            "page": 1,
            "results": Lampa.Storage.get('kinorium_movies', [])
        });
    }

    function clear() {
        network.clear();
    }
    var Api = {
        full: full,
        clear: clear
    };

    function component(object) {
        var comp = new Lampa.InteractionCategory(object);
        comp.create = function() {
            Api.full(object, this.build.bind(this), this.empty.bind(this));
        };
        comp.nextPageReuest = function(object, resolve, reject) {
            Api.full(object, resolve.bind(comp), reject.bind(comp));
        };
        return comp;
    }

    // Функция для ввода ID пользователя через диалоговое окно
    function inputUserId(title) {
        var currentUserId = Lampa.Storage.get('kinorium_user_id', '');
        
        Lampa.Input.edit({
            free: true,
            title: title,
            nosave: true,
            value: currentUserId,
            layout: 'default',
            keyboard: 'lampa'
        }, function(input) {
            if (input) {
                Lampa.Storage.set('kinorium_user_id', input);
                Lampa.Noty.show('ID пользователя установлен');
                
                // Обновляем отображение в настройках
                setTimeout(function() {
                    var element = $('div[data-name="kinorium_set_user_id"]');
                    if (element.length) {
                        element.find('.settings-param__name').text('ID: ' + input);
                    }
                }, 100);
            }
        });
    }

    function startPlugin() {
        var manifest = {
            type: 'video',
            version: '0.4.0',
            name: 'Кинориум',
            description: '',
            component: 'kinorium'
        };
        Lampa.Manifest.plugins.push(manifest);
        Lampa.Component.add('kinorium', component);

        function add() {
            var button = $("<li class=\"menu__item selector\">\n            <div class=\"menu__ico\">\n                <svg width=\"239\" height=\"239\" viewBox=\"0 0 239 239\" fill=\"currentColor\" xmlns=\"http://www.w3.org/2000/svg\" xml:space=\"preserve\"><path fill=\"currentColor\" d=\"M215 121.415l-99.297-6.644 90.943 36.334a106.416 106.416 0 0 0 8.354-29.69z\" /><path fill=\"currentColor\" d=\"M194.608 171.609C174.933 197.942 143.441 215 107.948 215 48.33 215 0 166.871 0 107.5 0 48.13 48.33 0 107.948 0c35.559 0 67.102 17.122 86.77 43.539l-90.181 48.07L162.57 32.25h-32.169L90.892 86.862V32.25H64.77v150.5h26.123v-54.524l39.509 54.524h32.169l-56.526-57.493 88.564 46.352z\" /><path d=\"M206.646 63.895l-90.308 36.076L215 93.583a106.396 106.396 0 0 0-8.354-29.688z\" fill=\"currentColor\"/></svg>\n            </div>\n            <div class=\"menu__text\">".concat(manifest.name, "</div>\n        </li>"));
            button.on('hover:enter', function() {
                Lampa.Activity.push({
                    url: '',
                    title: manifest.name,
                    component: 'kinorium',
                    page: 1
                });
            });
            $('.menu .menu__list').eq(0).append(button);
        }
        if(window.appready) add();
        else {
            Lampa.Listener.follow('app', function(e) {
                if(e.type == 'ready') add();
            });
        }

        // SETTINGS
        window.lampa_settings = window.lampa_settings || {};
        
        if(!window.lampa_settings.kinorium) {
            Lampa.SettingsApi.addComponent({
                component: 'kinorium',
                icon: '<svg width=\"239\" height=\"239\" viewBox=\"0 0 239 239\" fill=\"currentColor\" xmlns=\"http://www.w3.org/2000/svg\" xml:space=\"preserve\"><path fill=\"currentColor\" d=\"M215 121.415l-99.297-6.644 90.943 36.334a106.416 106.416 0 0 0 8.354-29.69z\" /><path fill=\"currentColor\" d=\"M194.608 171.609C174.933 197.942 143.441 215 107.948 215 48.33 215 0 166.871 0 107.5 0 48.13 48.33 0 107.948 0c35.559 0 67.102 17.122 86.77 43.539l-90.181 48.07L162.57 32.25h-32.169L90.892 86.862V32.25H64.77v150.5h26.123v-54.524l39.509 54.524h32.169l-56.526-57.493 88.564 46.352z\" /><path d=\"M206.646 63.895l-90.308 36.076L215 93.583a106.396 106.396 0 0 0-8.354-29.688z\" fill=\"currentColor\"/></svg>',
                name: 'Кинориум'
            });
        }
        
        Lampa.SettingsApi.addParam({
            component: 'kinorium',
            param: {
                type: 'title'
            },
            field: {
                name: 'Аккаунт',
            }
        });
        
        // Заменяем текстовое поле на кнопку с диалоговым вводом
        var currentUserId = Lampa.Storage.get('kinorium_user_id', '');
        Lampa.SettingsApi.addParam({
            component: 'kinorium',
            param: {
                type: 'button',
                name: 'kinorium_set_user_id'
            },
            field: {
                name: currentUserId ? 'ID: ' + currentUserId : 'Установить ID пользователя',
                description: 'Нажмите чтобы установить ваш ID пользователя Кинориум'
            },
            onChange: function() {
                inputUserId('Введите ID пользователя Кинориум');
            }
        });
        
        Lampa.SettingsApi.addParam({
            component: 'kinorium',
            param: {
                type: 'title'
            },
            field: {
                name: 'Список "Буду смотреть"',
            }
        });
        
        Lampa.SettingsApi.addParam({
            component: 'kinorium',
            param: {
                name: 'kinorium_add_to_favorites',
                type: 'trigger',
                default: false
            },
            field: {
                name: 'Добавлять в Избранное',
                description: 'Будущие, еще не вышедшие релизы добавляются в список Позже'
            }
        });
        
        Lampa.SettingsApi.addParam({
            component: 'kinorium',
            param: {
                type: 'button',
                name: 'kinorium_refresh'
            },
            field: {
                name: 'Обновить список',
                description: 'Загрузить актуальный список фильмов'
            },
            onChange: function() {
                getKinoriumData();
            }
        });
        
        Lampa.SettingsApi.addParam({
            component: 'kinorium',
            param: {
                type: 'button',
                name: 'kinorium_delete_cache'
            },
            field: {
                name: 'Очистить кэш фильмов',
                description: 'Необходимо при возникновении проблем'
            },
            onChange: function() {
                Lampa.Storage.set('kinorium_movies', []);
                Lampa.Noty.show('Кэш Кинориума очищен');
            }
        });
        
        window.lampa_settings.kinorium = true;
    }
    
    if(!window.kinorium_ready) {
        window.kinorium_ready = true;
        startPlugin();
    }
})();
