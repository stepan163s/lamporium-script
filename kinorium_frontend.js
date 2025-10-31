(function() {
    'use strict';
    var network = new Lampa.Reguest();

    function calculateProgress(total, current) {
        if(total == current) {
            Lampa.Noty.show('Обновление списка фильмов Кинориума завершено (' + String(total) + ')');
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

    function processKinoriumData(data) {
        if(data && data.movies) {
            var kinoriumMovies = Lampa.Storage.get('kinorium_movies', []);
            var receivedMovies = data.movies;
            var receivedMoviesCount = receivedMovies.length;
            console.log('Kinorium', "Movies received count: " + String(receivedMoviesCount));
            
            if(receivedMoviesCount == 0) {
                Lampa.Noty.show('В списке "Буду смотреть" Кинориума нет фильмов');
                return;
            }
            
            const receivedMovieIds = new Set(receivedMovies.map(m => String(m.id)));
            kinoriumMovies = kinoriumMovies.filter(movie => receivedMovieIds.has(String(movie.kinorium_id)));
            Lampa.Storage.set('kinorium_movies', JSON.stringify(kinoriumMovies));
            
            let processedItems = 1;
            
            receivedMovies.forEach(m => {
                const existsInLocalStorage = kinoriumMovies.some(km => km.kinorium_id === String(m.id));
                
                if (!existsInLocalStorage) {
                    var title = m.originalTitle || m.russianTitle;
                    console.log('Kinorium', 'Processing: ' + title + ' (' + m.year + ')');
                    
                    var movieTitle = m.originalTitle || m.russianTitle;
                    var movieType = m.isSerial ? 'tv' : 'movie';
                    var movieYear = m.year;
                    
                    // ПРОСТОЙ ПОИСК В TMDB ПО НАЗВАНИЮ И ГОДУ
                    var url;
                    if (movieType === 'movie') {
                        url = Lampa.Utils.protocol() + 'tmdb.'+ Lampa.Manifest.cub_domain +'/3/search/movie?query=' + encodeURIComponent(movieTitle) + '&api_key=4ef0d7355d9ffb5151e987764708ce96&year=' + String(movieYear) + '&language=ru';
                    } else {
                        url = Lampa.Utils.protocol() + 'tmdb.'+ Lampa.Manifest.cub_domain +'/3/search/tv?query=' + encodeURIComponent(movieTitle) + '&api_key=4ef0d7355d9ffb5151e987764708ce96&year=' + String(movieYear) + '&language=ru';
                    }
                    
                    console.log('Kinorium', 'TMDB Search URL: ' + url);
                    
                    network.silent(url, function(tmdbData) {
                        if(tmdbData) {
                            var movieItem = null;
                            
                            // Простая обработка ответа TMDB
                            if (tmdbData.results && tmdbData.results[0]) {
                                movieItem = tmdbData.results[0];
                            }
                            
                            if(movieItem) {
                                console.log('Kinorium', '✅ Found in TMDB: ' + movieItem.title + ' (ID: ' + movieItem.id + ')');
                                
                                movieItem.kinorium_id = String(m.id);
                                movieItem.source = "tmdb";
                                kinoriumMovies = Lampa.Storage.get('kinorium_movies', []);
                                kinoriumMovies.unshift(movieItem);
                                Lampa.Storage.set('kinorium_movies', JSON.stringify(kinoriumMovies));
                            } else {
                                console.log('Kinorium', '❌ Not found in TMDB: ' + movieTitle);
                            }
                        } else {
                            console.log('Kinorium', '❌ No TMDB data received for: ' + movieTitle);
                        }
                        calculateProgress(receivedMoviesCount, processedItems++);
                    }, function(error) {
                        console.log('Kinorium', '❌ TMDB request failed for: ' + movieTitle, error);
                        calculateProgress(receivedMoviesCount, processedItems++);
                    });
                    
                } else {
                    console.log('Kinorium', '✓ Already in cache: ' + (m.originalTitle || m.russianTitle));
                    calculateProgress(receivedMoviesCount, processedItems++);
                }
            });
        } else {
            Lampa.Noty.show('Невозможно обработать данные от Кинориума');
            console.log('Kinorium', 'Invalid data format:', data);
        }
    }

    function getKinoriumData() {
        console.log('Kinorium', 'Starting to get Kinorium data...');
        
        var userId = Lampa.Storage.get('kinorium_user_id');
        if (!userId) {
            Lampa.Noty.show('Сначала укажите ID пользователя в настройках');
            return;
        }
        
        var url = 'http://104.164.54.178:5000/lamporium/api/watchlist';
        var payload = { user_id: userId };
        
        console.log('Kinorium', 'Requesting data for user:', userId);
        
        network.silent(url, function(data) {
            console.log('Kinorium', 'Received data from API, movies count:', data.movies ? data.movies.length : 0);
            processKinoriumData(data);
        }, function(error) {
            console.log('Kinorium', '❌ API request failed:', error);
            Lampa.Noty.show('Ошибка при получении данных от Кинориума');
        }, JSON.stringify(payload), {
            type: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
    }

    function full(params, oncomplete, onerror) {
        var moviesFromStorage = Lampa.Storage.get('kinorium_movies', []);
        console.log('Kinorium', 'Returning ' + moviesFromStorage.length + ' movies from storage');
        
        oncomplete({
            "secuses": true,
            "page": 1,
            "results": moviesFromStorage
        });
        
        // Запускаем обновление только если указан ID пользователя
        var userId = Lampa.Storage.get('kinorium_user_id');
        if (userId) {
            getKinoriumData();
        }
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

    // Функция для ввода ID пользователя
    function requestKinoriumUserId() {
        Lampa.Input.edit({
            free: true,
            title: 'Введите ID пользователя Кинориума',
            nosave: true,
            value: Lampa.Storage.get('kinorium_user_id') || '',
            layout: 'nums',
            keyboard: 'lampa'
        }, function(input) {
            if (input) {
                Lampa.Storage.set('kinorium_user_id', input);
                Lampa.Noty.show('ID пользователя сохранен: ' + input);
                // Автоматически обновляем данные после установки ID
                getKinoriumData();
            } else {
                Lampa.Noty.show('ID пользователя не введен');
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
        
        Lampa.Manifest.plugins = manifest;
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
        
        Lampa.SettingsApi.addParam({
            component: 'kinorium',
            param: {
                type: 'button',
                name: 'kinorium_set_user_id'
            },
            field: {
                name: 'Установить ID пользователя',
                description: 'Текущий ID: ' + (Lampa.Storage.get('kinorium_user_id') || 'не установлен')
            },
            onChange: () => {
                requestKinoriumUserId();
            }
        });

        Lampa.SettingsApi.addParam({
            component: 'kinorium',
            param: {
                type: 'title'
            },
            field: {
                name: 'Список Буду смотреть',
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
                name: 'kinorium_delete_cache'
            },
            field: {
                name: 'Очистить кэш фильмов',
                description: 'Необходимо при возникновении проблем'
            },
            onChange: () => {
                Lampa.Storage.set('kinorium_movies', []);
                Lampa.Noty.show('Кэш Кинориума очищен');
            }
        });        
    }
    
    if(!window.kinorium_ready) startPlugin();
})();
