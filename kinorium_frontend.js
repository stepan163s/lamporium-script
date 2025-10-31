(function() {
    'use strict';
    var network = new Lampa.Reguest();

    function getRandomKinopoiskTechKey() {
        const keys = ['8c8e1a50-6322-4135-8875-5d40a5420d86', 'f1d94351-2911-4485-b037-97817098724e', '8c8e1a50-6322-4135-8875-5d40a5420d86'];
        const randomIndex = Math.floor(Math.random() * keys.length);
        return keys[randomIndex];
    }

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
        // use cache
        if(data && data.movies) {
            var kinoriumMovies = Lampa.Storage.get('kinorium_movies', []);
            
            // Преобразуем данные Kinorium в формат похожий на Kinopoisk
            var receivedMovies = data.movies.map(movie => {
                return {
                    movie: {
                        id: movie.id,
                        title: {
                            localized: movie.russianTitle,
                            original: movie.originalTitle
                        }
                    }
                };
            });
            
            var receivedMoviesCount = receivedMovies.length;
            var moviesCount = receivedMoviesCount;
            console.log('Kinorium', "Total planned to watch movies found: " + String(moviesCount));
            console.log('Kinorium', "Movies received count: " + String(receivedMoviesCount));
            if(receivedMoviesCount == 0) {
                Lampa.Noty.show('В списке "Буду смотреть" Кинориума нет фильмов');
            }
            const receivedMovieIds = new Set(receivedMovies.map(m => String(m.movie.id)));
            // filter out movies that are no longer present in receivedMovies
            kinoriumMovies = kinoriumMovies.filter(movie => receivedMovieIds.has(String(movie.kinorium_id)));
            Lampa.Storage.set('kinorium_movies', JSON.stringify(kinoriumMovies));
            let processedItems = 1;
            receivedMovies.forEach(m => {
                const existsInLocalStorage = kinoriumMovies.some(km => km.kinorium_id === String(m.movie.id));
                if (!existsInLocalStorage) {
                    // get movie data
                    var title = m.movie.title.localized || m.movie.title.original;
                    console.log('Kinorium', 'Getting details for movie: ' + String(m.movie.id) + ', movie title: ' + title);
                    
                    // Получаем оригинальные данные фильма из Kinorium
                    var originalMovieData = data.movies.find(mov => mov.id == m.movie.id);
                    var isSerial = originalMovieData ? originalMovieData.isSerial : false;
                    var movieYear = originalMovieData ? originalMovieData.year : null;
                    
                    // Используем Alloha API для получения TMDB ID (как в оригинальном скрипте)
                    network.silent('https://api.alloha.tv/?token=04941a9a3ca3ac16e2b4327347bbc1&kp=' + String(m.movie.id), function(data) {
                        if (data && data.data) {
                            var movieIMDBid = data.data.id_imdb;
                            var movieTMDBid = data.data.id_tmdb ? data.data.id_tmdb : null;
                            var movieTitle = data.data.original_name ? data.data.original_name : data.data.name;
                            
                            // Определяем тип контента на основе данных Kinorium
                            var movieType = isSerial ? 'tv' : 'movie';
                            var movieYear = originalMovieData ? originalMovieData.year : data.data.year;
                            
                            if (movieTMDBid) {
                                console.log('Kinorium', 'TMDB movie id found: ' + String(movieTMDBid) + ' for kinorium id: ' + String(m.movie.id));
                                var url = Lampa.Utils.protocol() + 'tmdb.'+ Lampa.Manifest.cub_domain +'/3/' + movieType + '/' + String(movieTMDBid) + '?api_key=4ef0d7355d9ffb5151e987764708ce96&language=ru';
                            } else {
                                if (movieType === 'movie') {
                                    console.log('Kinorium', 'No TMDB movie id found for kinorium id: ' + String(m.movie.id) + ', will search by movie title: ' + movieTitle);
                                    var url = Lampa.Utils.protocol() + 'tmdb.'+ Lampa.Manifest.cub_domain +'/3/search/movie?query=' + encodeURIComponent(movieTitle) + '&api_key=4ef0d7355d9ffb5151e987764708ce96&year=' + String(movieYear) + '&language=ru';
                                } else { // TV_SERIES
                                    console.log('Kinorium', 'No TMDB movie id found for kinorium id: ' + String(m.movie.id) + ', will search by tv series title: ' + movieTitle);
                                    var url = Lampa.Utils.protocol() + 'tmdb.'+ Lampa.Manifest.cub_domain +'/3/search/tv?query=' + encodeURIComponent(movieTitle) + '&api_key=4ef0d7355d9ffb5151e987764708ce96&year=' + String(movieYear) + '&language=ru';
                                }
                            }
                            // getting movie details
                            network.silent(url, function(data) {
                                if(data) {
                                    if (movieTMDBid) {
                                        var movieItem = data;
                                    } else {
                                        if (data.movie_results && data.movie_results[0]) {
                                            var movieItem = data.movie_results[0];
                                        } else if(data.tv_results && data.tv_results[0]) {
                                            var movieItem = data.tv_results[0];
                                        } else if(data.results && data.results[0]) {
                                            var movieItem = data.results[0];
                                        }
                                    }
                                    if(movieItem) {
                                        console.log('Kinorium', 'TMDB id found: ' + movieItem.id + ' for kinorium id: ' + String(m.movie.id));

                                        var movieDateStr = movieItem.release_date || movieItem.first_air_date; // film or tv series
                                        var movieDate = new Date(movieDateStr);

                                        if (movieDate <= new Date()) {                                            
                                            movieItem.kinorium_id = String(m.movie.id);
                                            movieItem.source = "tmdb";
                                            kinoriumMovies = Lampa.Storage.get('kinorium_movies', []); // re-read data if another process modified it
                                            kinoriumMovies.unshift(movieItem);
                                            Lampa.Storage.set('kinorium_movies', JSON.stringify(kinoriumMovies));
                                        } else {
                                            console.log('Kinorium', 'Movie or TV with kinorium id ' + String(m.movie.id) + ' not released yet, release date:', movieDate);    
                                            if (Lampa.Storage.get('kinorium_add_to_favorites', false)) { // add to favorites
                                                Lampa.Favorite.add('wath', movieItem, 100);
                                            }
                                        }
                                        
                                    } else {
                                        console.log('Kinorium', 'No result found for ' + movieTitle + ', ' + movieYear, data);
                                    }
                                } else {
                                    console.log('Kinorium', 'No movie found by TMDB id: ' + String(movieTMDBid));
                                }
                                calculateProgress(receivedMoviesCount, processedItems++);
                            }, function(data) {
                                console.log('Kinorium', 'tmdb.cub.red error, data: ' + String(data));
                                calculateProgress(receivedMoviesCount, processedItems++);
                            });
                        } else {
                            console.log('Kinorium', 'No movie found for kinorium id: ' + String(m.movie.id) + ', movie: ' + title);
                            calculateProgress(receivedMoviesCount, processedItems++);
                        }
                    }, function(data) {
                        console.log('Kinorium', 'alloha.tv error, data: ' + String(data));
                        calculateProgress(receivedMoviesCount, processedItems++);
                    }, false, {
                        type: 'get'
                    });
                } else {
                    console.log('Kinorium', 'Reading data from local storage for movie: ' + String(m.movie.id))
                    calculateProgress(receivedMoviesCount, processedItems++);
                }
            })
        } else {
            Lampa.Noty.show('Невозможно обработать данные, полученные от Кинориума');
            console.log('Kinorium', 'processKinoriumData - ');
            console.log('Kinorium', data);
        }
    }

    function getKinoriumData() {
        console.log('Kinorium', 'Starting to get Kinorium data...');
        
        // Заменяем только этот блок - получаем данные от Kinorium вместо Kinopoisk
        var url = 'http://104.164.54.178:5000/lamporium/api/watchlist';
        var payload = { user_id: "928543" };
        
        network.silent(url, function(data) { // on success
            processKinoriumData(data);
        }, function(data) { // on error
            console.log('Kinorium', 'Error, kinorium backend', data);
            Lampa.Noty.show('Ошибка при получении данных от Кинориума');
        }, JSON.stringify(payload), {
            type: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
    }

    function full(params, oncomplete, onerror) {
        // Полностью сохраняем логику из рабочего скрипта
        getKinoriumData();
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

    // Остальная часть скрипта полностью сохраняется как в рабочем Kinopoisk скрипте
    // только заменяем названия с "kinopoisk" на "kinorium"

    function getToken(device_code, refresh) {
        var client_id = 'b8b9c7a09b79452094e12f6990009934';
        if(!refresh) {
            var token_data = {
                'grant_type': 'device_code',
                'code': device_code,
                'client_id': client_id,
                'client_secret': '0e7001e272944c05ae5a0df16e3ea8bd'
            }
        } else { // refresh token
            var token_data = {
                'grant_type': 'refresh_token',
                'refresh_token': device_code, // pass refresh token as device_code
                'client_id': client_id,
                'client_secret': '0e7001e272944c05ae5a0df16e3ea8bd'
            }
        }
        network.silent('https://oauth.yandex.ru/token', function(data) { // on token success
            if(data.access_token) {
                Lampa.Storage.set('kinorium_access_token', data.access_token);
                Lampa.Storage.set('kinorium_refresh_token', data.refresh_token);
                Lampa.Storage.set('kinorium_token_expires', data.expires_in * 1000 + Date.now());
                Lampa.Modal.close();
                getKinoriumData();
            } else {
                Lampa.Noty.show('Не удалось получить token');
                console.log('Kinorium', 'Error during OAuth', data.error);
            }
        }, function(data) { // on token error
            Lampa.Noty.show(data.responseJSON.error_description);
            console.log('Kinorium', 'Token error', data);
        }, token_data);
    }

    function getDeviceCode() {
        const uuid4 = () => {
            const ho = (n, p) => n.toString(16).padStart(p, 0);
            const data = crypto.getRandomValues(new Uint8Array(16));
            data[6] = (data[6] & 0xf) | 0x40;
            data[8] = (data[8] & 0x3f) | 0x80;
            const view = new DataView(data.buffer);
            return `${ho(view.getUint32(0), 8)}${ho(view.getUint16(4), 4)}${ho(view.getUint16(6), 4)}${ho(view.getUint16(8), 4)}${ho(view.getUint32(10), 8)}${ho(view.getUint16(14), 4)}`;
        };
        Lampa.Storage.set('kinorium_deviceid', uuid4());
        var client_id = 'b8b9c7a09b79452094e12f6990009934';
        var device_code_data = {
            'client_id': client_id,
            'device_id': Lampa.Storage.get('kinorium_deviceid', '')
        }
        network.silent('https://oauth.yandex.ru/device/code', function(data) { // on device code success
            if(data.user_code && data.device_code) {
                let modal = $('<div><div class="about">Перейдите по ссылке https://ya.ru/device на любом устройстве и введите код<br><br><b>' + data.user_code + '</b><br><br></div><br><div class="broadcast__device selector" style="textalign: center">Готово</div></div>')
                Lampa.Modal.open({
                    title: 'Авторизация',
                    html: modal,
                    align: 'center',
                    onBack: () => {
                        Lampa.Modal.close()
                    },
                    onSelect: () => {
                        getToken(data.device_code, false);
                    }
                })
            } else {
                Lampa.Noty.show('Не удалось получить user_code');
                console.log('Kinorium', 'Failed to get user_code', data.error);
            }
        }, function(data) { // on device code error
            Lampa.Noty.show(data.responseJSON.error_description);
            console.log('Kinorium', 'Failed to get device code', data);
        }, device_code_data);
    }

    function getUserEmail() {
        network.silent('https://login.yandex.ru/info?format=json', function(data) {
            if (data.default_email) {
                Lampa.Storage.set('kinorium_email', data.default_email);
                $('div[data-name="kinorium_auth"]').find('.settings-param__name').text(data.default_email);
            } else {
                Lampa.Noty.show('Не удалось получить email пользователя');
                console.log('Kinorium', 'Failed to get user email', data.error);                
            }
        }, function(data) {
            Lampa.Noty.show(data.responseText);
            console.log('Kinorium', 'Failed to get user email', data);
        }, false, {
            type: 'get',
            headers: {
                'Authorization': 'OAuth ' + Lampa.Storage.get('kinorium_access_token')
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
        if(Lampa.Storage.get('kinorium_access_token', '') !== '' && Lampa.Storage.get('kinorium_token_expires', 0) < Date.now()) {
            console.log('Kinorium', 'Token should be refreshed')
            getToken(Lampa.Storage.get('kinorium_refresh_token', ''), true);
        }

        function add() {
            var button = $("<li class=\"menu__item selector\">\n            <div class=\"menu__ico\">\n                <svg width=\"239\" height=\"239\" viewBox=\"0 0 239 239\" fill=\"currentColor\" xmlns=\"http://www.w3.org/2000/svg\" xml:space=\"preserve\"><path fill=\"currentColor\" d=\"M215 121.415l-99.297-6.644 90.943 36.334a106.416 106.416 0 0 0 8.354-29.69z\" /><path fill=\"currentColor\" d=\"M194.608 171.609C174.933 197.942 143.441 215 107.948 215 48.33 215 0 166.871 0 107.5 0 48.13 48.33 0 107.948 0c35.559 0 67.102 17.122 86.77 43.539l-90.181 48.07L162.57 32.25h-32.169L90.892 86.862V32.25H64.77v150.5h26.123v-54.524l39.509 54.524h32.169l-56.526-57.493 88.564 46.352z\" /><path d=\"M206.646 63.895l-90.308 36.076L215 93.583a106.396 106.396 0 0 0-8.354-29.688z\" fill=\"currentColor\"/></svg>\n            </div>\n            <div class=\"menu__text\">".concat(manifest.name, "</div>\n        </li>"));
            button.on('hover:enter', function() {
                if(Lampa.Storage.get('kinorium_access_token', '') == '') {
                    getDeviceCode();
                }
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
        })
        var kinorium_email = Lampa.Storage.get('kinorium_email', false);
        Lampa.SettingsApi.addParam({
            component: 'kinorium',
            param: {
                type: 'button',
                name: 'kinorium_auth'
            },
            field: {
                name: kinorium_email ? kinorium_email : 'Авторизоваться',
            },
            onChange: () => {
                if (Lampa.Storage.get('kinorium_email', false)) {
                    Lampa.Select.show({
                        title: 'Выйти из аккаунта',
                        items: [{
                            title: 'Да',
                            confirm: true
                        }, {
                            title: 'Нет'
                        }],
                        onSelect: (a) => {
                            if(a.confirm) {
                                Lampa.Storage.set('kinorium_email', '');
                                Lampa.Storage.set('kinorium_access_token', '');
                                Lampa.Storage.set('kinorium_refresh_token', '');
                                Lampa.Storage.set('kinorium_token_expires', 0); 
                                $('div[data-name="kinorium_auth"]').find('.settings-param__name').text('Авторизоваться');                           
                            }
                            Lampa.Controller.toggle('settings_component');
                        },
                        onBack: ()=>{
                            Lampa.Controller.toggle('settings_component');
                        },
                    })
                } else {
                    Lampa.Controller.toContent();
                    getDeviceCode();
                }
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
        })
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
        })        
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
