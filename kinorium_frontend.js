(function() {
    'use strict';

    // network instance will be created where needed (after appready)
    // fallback базовый адрес API бекенда (пользовательская настройка через Settings)
    var API_BASE = (Lampa.Storage.get('kinorium_api_base') || 'https://stepan163.ru').replace(/\/$/, '');

    // --- Вспомогательные функции ---
    function getTmdbBase() {
        try {
            var proto = (typeof location !== 'undefined' && location.protocol === 'http:') ? 'http://' : 'https://';
            return proto + 'tmdb.cub.red';
        } catch (e) {
            return 'https://tmdb.cub.red';
        }
    }

    function safeParseStorage(key, def) {
        var v = Lampa.Storage.get(key, def);
        if (typeof v === 'string') {
            try { return JSON.parse(v); } catch(e) { return def; }
        }
        return v === undefined || v === null ? def : v;
    }

    function requestKinoriumUserId(callback) {
        Lampa.Input.edit({
            free: true,
            title: 'Введите ID пользователя Кинориума7',
            nosave: true,
            value: '',
            layout: 'default',
            keyboard: 'lampa'
        }, function(input) {
            if (input) {
                Lampa.Storage.set('kinorium_user_id', input);
                Lampa.Noty.show('ID пользователя сохранен');
                if (callback) callback();
            } else {
                Lampa.Noty.show('ID пользователя не введен');
            }
        });
    }

    function calculateProgress(total, current) {
        if (total == current) {
            Lampa.Noty.show('Обновление списка фильмов Кинориума завершено');
            if (Lampa.Storage.get('kinorium_launched_before', false) == false) {
                Lampa.Storage.set('kinorium_launched_before', true);
                Lampa.Activity.push({ url: '', title: 'Кинориум', component: 'kinorium', page: 1 });
            }
        }
    }

    function processKinoriumDataFromJson(payload) {
        var network = new Lampa.Reguest();
        try {
            var movies = Array.isArray(payload && payload.movies) ? payload.movies : [];
            if (movies.length == 0) {
                Lampa.Noty.show('В списке "Буду смотреть" Кинориума нет фильмов');
                return;
            }

            var kinoriumMovies = safeParseStorage('kinorium_movies', []);
            // keep only items that still exist in received list
            const receivedMovieIds = new Set(movies.map(m => String(m.id || m.kinorium_id)));
            kinoriumMovies = kinoriumMovies.filter(movie => receivedMovieIds.has(String(movie.kinorium_id)));
            Lampa.Storage.set('kinorium_movies', JSON.stringify(kinoriumMovies));

            let processedItems = 1;
            var tmdbBase = getTmdbBase();
            console.log('Kinorium', 'TMDB base used:', tmdbBase);

            movies.forEach(m => {
                const kinorium_id = String(m.id || m.kinorium_id || '');
                const isSerial = !!m.isSerial;
                const russianTitle = m.name || m.russianTitle || '';
                const originalTitle = m.originalTitle || '';
                const year = m.year ? String(m.year) : '';
                const existsInLocalStorage = kinoriumMovies.some(km => String(km.kinorium_id) === kinorium_id);

                if (!existsInLocalStorage) {
                    const movieType = isSerial ? 'tv' : 'movie';
                    const searchTitle = originalTitle || russianTitle || '';
                    var url = tmdbBase + '/3/search/' + movieType +
                        '?query=' + encodeURIComponent(searchTitle) +
                        '&api_key=4ef0d7355d9ffb5151e987764708ce96' +
                        (year ? '&year=' + year : '') +
                        '&language=ru';

                    console.log('Kinorium', 'TMDB search URL:', url);

                    // Запрос на TMDB
                    network.silent(url, function(data) {
                        try {
                            if (data && (data.results && data.results[0] || data.movie_results && data.movie_results[0] || data.tv_results && data.tv_results[0])) {
                                console.log('Kinorium TMDB OK:', url);
                                var movieItem = null;
                                if (data.results && data.results[0]) movieItem = data.results[0];
                                else if (data.movie_results && data.movie_results[0]) movieItem = data.movie_results[0];
                                else if (data.tv_results && data.tv_results[0]) movieItem = data.tv_results[0];

                                var movieDateStr = movieItem.release_date || movieItem.first_air_date || '';
                                var movieDate = movieDateStr ? new Date(movieDateStr) : new Date();

                                // если дата релиза в прошлом или нет даты — добавляем
                                if (!movieDateStr || movieDate <= new Date()) {
                                    movieItem.kinorium_id = kinorium_id;
                                    movieItem.source = "tmdb";
                                    kinoriumMovies = safeParseStorage('kinorium_movies', []);
                                    kinoriumMovies.unshift(movieItem);
                                    Lampa.Storage.set('kinorium_movies', JSON.stringify(kinoriumMovies));
                                } else {
                                    if (Lampa.Storage.get('kinorium_add_to_favorites', false)) {
                                        Lampa.Favorite.add('wath', movieItem, 100);
                                    }
                                }
                            } else {
                                console.log('Kinorium', 'TMDB returned no results for', searchTitle, data);
                            }
                        } catch (e) {
                            console.error('Kinorium', 'Error processing TMDB response', e);
                        }
                        calculateProgress(movies.length, processedItems++);
                    }, function(err) {
                        console.error('Kinorium', 'TMDB request error:', err, 'URL:', url);
                        calculateProgress(movies.length, processedItems++);
                    }, null, { type: 'get', crossdomain: true });
                } else {
                    calculateProgress(movies.length, processedItems++);
                }
            });
        } catch (e) {
            console.error('Kinorium', 'processKinoriumDataFromJson error', e);
            Lampa.Noty.show('Ошибка при обработке данных Кинориума');
        }
    }

    function getKinoriumData() {
        var network = new Lampa.Reguest();
        var userId = Lampa.Storage.get('kinorium_user_id', '');
        if (!userId) {
            requestKinoriumUserId(getKinoriumData);
            return;
        }

        // отложим до appready, если ещё не готово (чтобы Manifest/cub_domain точно был доступен)
        if (!window.appready) {
            Lampa.Listener.follow('app', function(e) {
                if (e.type == 'ready') getKinoriumData();
            });
            return;
        }

        var url = 'http://104.164.54.178:5000/lamporium/api/watchlist';
        var payload = { user_id: '928543' };

        console.log('Kinorium', 'Requesting kinorium backend:', url, 'payload:', payload);

        network.silent(url, function(json) {
            if (!json) {
                console.error('Kinorium', 'Empty response from backend');
                Lampa.Noty.show('Бэкенд вернул пустой ответ');
                return;
            }
            try {
                processKinoriumDataFromJson(json);
            } catch (e) {
                console.error('Kinorium', 'Error in success handler', e);
                Lampa.Noty.show('Ошибка при обработке ответа от бэкенда Кинориума');
            }
        }, function(err) {
            console.error('Kinorium', 'Ошибка при получении данных с бэкенда Кинориума', err);
            Lampa.Noty.show('Ошибка при получении данных с бэкенда Кинориума');
        }, JSON.stringify(payload), {
            type: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
    }

    function full(params, oncomplete, onerror) {
        var userId = Lampa.Storage.get('kinorium_user_id', '');
        if (userId) {
            if (window.appready) getKinoriumData();
            else Lampa.Listener.follow('app', function(e) { if (e.type == 'ready') getKinoriumData(); });
        } else {
            requestKinoriumUserId(function() {
                if (window.appready) getKinoriumData();
                else Lampa.Listener.follow('app', function(e) { if (e.type == 'ready') getKinoriumData(); });
            });
        }

        // сразу возвращаем результат из локального кэша (как было в исходнике)
        try {
            oncomplete({ secuses: true, page: 1, results: Lampa.Storage.get('kinorium_movies', []) });
        } catch (e) {
            console.error('Kinorium', 'Error calling oncomplete', e);
            oncomplete({ secuses: true, page: 1, results: [] });
        }
    }

    function clear() {}
    var Api = { full: full, clear: clear };

    function component(object) {
        var comp = new Lampa.InteractionCategory(object);
        comp.create = function() { Api.full(object, this.build.bind(this), this.empty.bind(this)); };
        comp.nextPageReuest = function(object, resolve, reject) { Api.full(object, resolve.bind(comp), reject.bind(comp)); };
        return comp;
    }

    function startPlugin() {
        var manifest = { type: 'video', version: '0.4.0', name: 'Кинориум', description: '', component: 'kinorium' };
        // push manifest в список плагинов
        if (!Lampa.Manifest.plugins) Lampa.Manifest.plugins = [];
        Lampa.Manifest.plugins.push(manifest);
        Lampa.Component.add('kinorium', component);

        function add() {
            var button = $("<li class=\"menu__item selector\">\n            <div class=\"menu__ico\">\n                <svg width=\"239\" height=\"239\" viewBox=\"0 0 239 239\" fill=\"currentColor\" xmlns=\"http://www.w3.org/2000/svg\" xml:space=\"preserve\"><path fill=\"currentColor\" d=\"M215 121.415l-99.297-6.644 90.943 36.334a106.416 106.416 0 0 0 8.354-29.69z\" /><path fill=\"currentColor\" d=\"M194.608 171.609C174.933 197.942 143.441 215 107.948 215 48.33 215 0 166.871 0 107.5 0 48.13 48.33 0 107.948 0c35.559 0 67.102 17.122 86.77 43.539l-90.181 48.07L162.57 32.25h-32.169L90.892 86.862V32.25H64.77v150.5h26.123v-54.524l39.509 54.524h32.169l-56.526-57.493 88.564 46.352z\" /><path d=\"M206.646 63.895l-90.308 36.076L215 93.583a106.396 106.396 0 0 0-8.354-29.688z\" fill=\"currentColor\"/></svg>\n            </div>\n            <div class=\"menu__text\">".concat(manifest.name, "</div>\n        </li>"));
            button.on('hover:enter', function() { Lampa.Activity.push({ url: '', title: manifest.name, component: 'kinorium', page: 1 }); });
            $('.menu .menu__list').eq(0).append(button);
        }
        if (window.appready) add(); else { Lampa.Listener.follow('app', function(e) { if (e.type == 'ready') add(); }); }

        if (!window.lampa_settings.kinorium) {
            Lampa.SettingsApi.addComponent({ component: 'kinorium', icon: '<svg width="239" height="239" viewBox="0 0 239 239" fill="currentColor" xmlns="http://www.w3.org/2000/svg" xml:space="preserve"><path fill="currentColor" d="M215 121.415l-99.297-6.644 90.943 36.334a106.416 106.416 0 0 0 8.354-29.69z" /><path fill="currentColor" d="M194.608 171.609C174.933 197.942 143.441 215 107.948 215 48.33 215 0 166.871 0 107.5 0 48.13 48.33 0 107.948 0c35.559 0 67.102 17.122 86.77 43.539l-90.181 48.07L162.57 32.25h-32.169L90.892 86.862V32.25H64.77v150.5h26.123v-54.524l39.509 54.524h32.169l-56.526-57.493 88.564 46.352z" /><path d="M206.646 63.895l-90.308 36.076L215 93.583a106.396 106.396 0 0 0-8.354-29.688z" fill="currentColor"/></svg>', name: 'Кинориум' });
        }

        Lampa.SettingsApi.addParam({ component: 'kinorium', param: { type: 'title' }, field: { name: 'Аккаунт' } });
        Lampa.SettingsApi.addParam({ component: 'kinorium', param: { type: 'button', name: 'kinorium_set_user_id' }, field: { name: 'Указать ID пользователя', description: 'Установить ID пользователя Кинориума' }, onChange: () => { requestKinoriumUserId(); } });
        Lampa.SettingsApi.addParam({ component: 'kinorium', param: { type: 'title' }, field: { name: 'API' } });
        Lampa.SettingsApi.addParam({ component: 'kinorium', param: { type: 'input', name: 'kinorium_api_base' }, field: { name: 'Адрес backend', description: 'Например https://stepan163.ru' }, onChange: () => {
            API_BASE = (Lampa.Storage.get('kinorium_api_base') || 'https://stepan163.ru').replace(/\/$/, '');
            Lampa.Noty.show('Адрес backend обновлён');
        } });
        Lampa.SettingsApi.addParam({ component: 'kinorium', param: { type: 'title' }, field: { name: 'Список "Буду смотреть"' } });
        Lampa.SettingsApi.addParam({ component: 'kinorium', param: { name: 'kinorium_add_to_favorites', type: 'trigger', default: false }, field: { name: 'Добавлять в Избранное', description: 'Будущие релизы — в список Позже' } });
        Lampa.SettingsApi.addParam({ component: 'kinorium', param: { type: 'button', name: 'kinorium_delete_cache' }, field: { name: 'Очистить кэш фильмов', description: 'Необходимо при возникновении проблем' }, onChange: () => { Lampa.Storage.set('kinorium_movies', []); Lampa.Noty.show('Кэш Кинориума очищен'); } });
    }

    if (!window.kinorium_ready) { window.kinorium_ready = true; startPlugin(); }
})();
