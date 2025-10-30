// Copied from root version; structured under frontend/
(function() {
    'use strict';

    var network = new Lampa.Reguest();
    var API_BASE = (Lampa.Storage.get('kinorium_api_base') || 'http://104.164.54.178:5000').replace(/\/$/, '');

    function requestKinoriumUserId(callback) {
        Lampa.Input.edit({
            free: true,
            title: 'Введите ID пользователя Кинориума2',
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
        if(total == current) {
            Lampa.Noty.show('Обновление списка фильмов Кинориума завершено');
            if(Lampa.Storage.get('kinorium_launched_before', false) == false) {
                Lampa.Storage.set('kinorium_launched_before', true);
                Lampa.Activity.push({ url: '', title: 'Кинориум', component: 'kinorium', page: 1 });
            }
        }
    }

    function processKinoriumDataFromJson(payload) {
        var movies = Array.isArray(payload && payload.movies) ? payload.movies : [];
        if(movies.length == 0) {
            Lampa.Noty.show('В списке "Буду смотреть" Кинориума нет фильмов');
            return;
        }

        var kinoriumMovies = Lampa.Storage.get('kinorium_movies', []);
        if (typeof kinoriumMovies === 'string') {
            try { kinoriumMovies = JSON.parse(kinoriumMovies); } catch(e) { kinoriumMovies = []; }
        }
        const receivedMovieIds = new Set(movies.map(m => String(m.id || m.kinorium_id)));
        kinoriumMovies = kinoriumMovies.filter(movie => receivedMovieIds.has(String(movie.kinorium_id)));
        Lampa.Storage.set('kinorium_movies', JSON.stringify(kinoriumMovies));

        let processedItems = 1;
        movies.forEach(m => {
            const kinorium_id = String(m.id || m.kinorium_id || '');
            const isSerial = !!m.isSerial;
            const russianTitle = m.name || m.russianTitle || '';
            const originalTitle = m.originalTitle || '';
            const year = m.year ? String(m.year) : '';
            const existsInLocalStorage = kinoriumMovies.some(km => km.kinorium_id === kinorium_id);

            if (!existsInLocalStorage) {
                const movieType = isSerial ? 'tv' : 'movie';
                const searchTitle = originalTitle || russianTitle;
                var url = Lampa.Utils.protocol() + 'tmdb.'+ Lampa.Manifest.cub_domain +'/3/search/' + movieType + 
                         '?query=' + encodeURIComponent(searchTitle) + 
                         '&api_key=4ef0d7355d9ffb5151e987764708ce96' + 
                         (year ? '&year=' + year : '') + 
                         '&language=ru';
                network.silent(url, function(data) {
                    if(data && data.results && data.results[0]) {
                        var movieItem = data.results[0];
                        var movieDateStr = movieItem.release_date || movieItem.first_air_date;
                        var movieDate = new Date(movieDateStr);
                        if (movieDate <= new Date()) {                                            
                            movieItem.kinorium_id = kinorium_id;
                            movieItem.source = "tmdb";
                            kinoriumMovies = Lampa.Storage.get('kinorium_movies', []);
                            if (typeof kinoriumMovies === 'string') { try { kinoriumMovies = JSON.parse(kinoriumMovies); } catch(e) { kinoriumMovies = []; } }
                            kinoriumMovies.unshift(movieItem);
                            Lampa.Storage.set('kinorium_movies', JSON.stringify(kinoriumMovies));
                        } else {
                            if (Lampa.Storage.get('kinorium_add_to_favorites', false)) {
                                Lampa.Favorite.add('wath', movieItem, 100);
                            }
                        }
                    }
                    calculateProgress(movies.length, processedItems++);
                }, function() {
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
            requestKinoriumUserId(getKinoriumData);
            return;
        }
        var url = API_BASE + '/lamporium/api/watchlist';
        var payload = { user_id: userId };
        network.silent(url, function(json) {
            processKinoriumDataFromJson(json);
        }, function() {
            Lampa.Noty.show('Ошибка при получении данных с бэкенда Кинориума');
        }, JSON.stringify(payload), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
    }

    function full(params, oncomplete, onerror) {
        var userId = Lampa.Storage.get('kinorium_user_id', '');
        if(userId) {
            getKinoriumData();
        } else {
            requestKinoriumUserId(function() { getKinoriumData(); });
        }
        oncomplete({ secuses: true, page: 1, results: Lampa.Storage.get('kinorium_movies', []) });
    }

    function clear() { network.clear(); }
    var Api = { full: full, clear: clear };

    function component(object) {
        var comp = new Lampa.InteractionCategory(object);
        comp.create = function() { Api.full(object, this.build.bind(this), this.empty.bind(this)); };
        comp.nextPageReuest = function(object, resolve, reject) { Api.full(object, resolve.bind(comp), reject.bind(comp)); };
        return comp;
    }

    function startPlugin() {
        var manifest = { type: 'video', version: '0.4.0', name: 'Кинориум', description: '', component: 'kinorium' };
        Lampa.Manifest.plugins.push(manifest);
        Lampa.Component.add('kinorium', component);

        function add() {
            var button = $("<li class=\"menu__item selector\">\n            <div class=\"menu__ico\">\n                <svg width=\"239\" height=\"239\" viewBox=\"0 0 239 239\" fill=\"currentColor\" xmlns=\"http://www.w3.org/2000/svg\" xml:space=\"preserve\"><path fill=\"currentColor\" d=\"M215 121.415l-99.297-6.644 90.943 36.334a106.416 106.416 0 0 0 8.354-29.69z\" /><path fill=\"currentColor\" d=\"M194.608 171.609C174.933 197.942 143.441 215 107.948 215 48.33 215 0 166.871 0 107.5 0 48.13 48.33 0 107.948 0c35.559 0 67.102 17.122 86.77 43.539л-90.181 48.07L162.57 32.25h-32.169L90.892 86.862V32.25H64.77v150.5h26.123в-54.524л39.509 54.524h32.169л-56.526-57.493 88.564 46.352z\" /><path d=\"M206.646 63.895л-90.308 36.076L215 93.583a106.396 106.396 0 0 0-8.354-29.688z\" fill=\"currentColor\"/></svg>\n            </div>\n            <div class=\"menu__text\">".concat(manifest.name, "</div>\n        </li>"));
            button.on('hover:enter', function() { Lampa.Activity.push({ url: '', title: manifest.name, component: 'kinorium', page: 1 }); });
            $('.menu .menu__list').eq(0).append(button);
        }
        if(window.appready) add(); else { Lampa.Listener.follow('app', function(e) { if(e.type == 'ready') add(); }); }

        if(!window.lampa_settings.kinorium) {
            Lampa.SettingsApi.addComponent({ component: 'kinorium', icon: '<svg width="239" height="239" viewBox="0 0 239 239" fill="currentColor" xmlns="http://www.w3.org/2000/svg" xml:space="preserve"><path fill="currentColor" d="M215 121.415l-99.297-6.644 90.943 36.334a106.416 106.416 0 0 0 8.354-29.69z" /><path fill="currentColor" d="M194.608 171.609C174.933 197.942 143.441 215 107.948 215 48.33 215 0 166.871 0 107.5 0 48.13 48.33 0 107.948 0c35.559 0 67.102 17.122 86.77 43.539л-90.181 48.07L162.57 32.25h-32.169L90.892 86.862V32.25H64.77в150.5h26.123в-54.524л39.509 54.524h32.169л-56.526-57.493 88.564 46.352z" /><path d="M206.646 63.895л-90.308 36.076L215 93.583a106.396 106.396 0 0 0-8.354-29.688z" fill="currentColor"/></svg>', name: 'Кинориум' });
        }

        Lampa.SettingsApi.addParam({ component: 'kinorium', param: { type: 'title' }, field: { name: 'Аккаунт' } });
        Lampa.SettingsApi.addParam({ component: 'kinorium', param: { type: 'button', name: 'kinorium_set_user_id' }, field: { name: 'Указать ID пользователя', description: 'Установить ID пользователя Кинориума' }, onChange: () => { requestKinoriumUserId(); } });
        Lampa.SettingsApi.addParam({ component: 'kinorium', param: { type: 'title' }, field: { name: 'API' } });
        Lampa.SettingsApi.addParam({ component: 'kinorium', param: { type: 'input', name: 'kinorium_api_base' }, field: { name: 'Адрес backend', description: 'Например http://104.164.54.178:5000' }, onChange: () => {} });
        Lampa.SettingsApi.addParam({ component: 'kinorium', param: { type: 'title' }, field: { name: 'Список "Буду смотреть"' } });
        Lampa.SettingsApi.addParam({ component: 'kinorium', param: { name: 'kinorium_add_to_favorites', type: 'trigger', default: false }, field: { name: 'Добавлять в Избранное', description: 'Будущие релизы — в список Позже' } });
        Lampa.SettingsApi.addParam({ component: 'kinorium', param: { type: 'button', name: 'kinorium_delete_cache' }, field: { name: 'Очистить кэш фильмов', description: 'Необходимо при возникновении проблем' }, onChange: () => { Lampa.Storage.set('kinorium_movies', []); Lampa.Noty.show('Кэш Кинориума очищен'); } });
    }

    if(!window.kinorium_ready){ window.kinorium_ready = true; startPlugin(); }
})();
