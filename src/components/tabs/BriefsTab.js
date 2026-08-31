import { Tab } from './Tab.js';
import { BriefsCollection, Query, Tag, TypeRegistry, TagRegistry, PersistenceAdapter } from 'https://21beckem.github.io/becker-briefs/BriefsCollection.js';
// import { BriefsCollection, Query, Tag, TypeRegistry, TagRegistry, PersistenceAdapter } from 'http://localhost:5501/BriefsCollection.js';
import { TodoType } from './brief-types/Todo.js';
// import { ScheduleType } from './ScheduleType.js';

// import { ApiError } from '../../api/ApiError.js';
// import { escapeHtml, getDayWithOrdinal } from '../../utils/helpers.js';

export class BriefsTab extends Tab {
    #context;
    #tagRegistry;
    #typeRegistry;
    #persistenceAdapter;
    #collection;

    constructor(context) {
        super();
        this.element.style.cssText = `
            display: flex;
            flex-direction: column;
            flex: 1;
            background-color: var(--BRIEFS-paper);
            padding-top: 0.2rem;
        `;
        this.#context = context;
        this.#typeRegistry = TypeRegistry.fromArray([TodoType]);

        this.#persistenceAdapter = PersistenceAdapter.fromObject({
            onSave: (...args) => this.#onSave(...args),
            onLoad: (...args) => this.#onLoad(...args),
            onDelete: (pageId) => this.#context.apiClient.delete(`/briefs/briefs/${pageId}`),
        });
    }

    async #onSave(pageObject) {
        const pageId = pageObject.id;
        if (pageId === null || pageId === undefined) {
            // create new page
            try {
                const res = await this.#context.apiClient.post('/briefs/briefs', pageObject);
                return res;
            } catch (error) {
                console.error('Error creating page:', error);
            }
        }
        try {
            // update existing page
            return await this.#context.apiClient.patch(`/briefs/briefs/${pageId}`, pageObject);
        } catch (error) {
            console.error('Error saving page:', error);
        }
    }

    async #onLoad(pageId) {
        try {
            const res = await this.#context.apiClient.get(`/briefs/briefs/${pageId}`);
            return res;
        } catch (error) {
            console.error('Error loading page:', error);
        }
    }

    async #getTagRegistry() {
        if (this.#tagRegistry) return this.#tagRegistry;
        const tags = await this.#context.apiClient.get('/briefs/tags');

        this.#tagRegistry = TagRegistry.fromObject({
            initialTags: tags.map(t => Tag.fromObject(t)),
            onCreateTag: async (label) => {
                const res = await this.#context.apiClient.post('/briefs/tags', {
                    label,
                    color: '#3A5A6B'
                });
                return Tag.fromObject(res);
            }
        });
        return this.#tagRegistry;
    }


    async init() {
        await this.#getTagRegistry();

        this.#collection = BriefsCollection.fromObject({
            container: this.element,
            onQuery: (query) => this.#onQuery(query),
            initialQuery: Query.fromWindowSearchParams(),
            head: document.head,
            typeRegistry: this.#typeRegistry,
            tagRegistry: this.#tagRegistry,
            persistenceAdapter: this.#persistenceAdapter,
            showDeleteBriefButton: true,
            showNewBriefButton: true,
        });
        this.#collection.node.style.width = '100%';
        this.#collection.node.style.maxWidth = '1000px';
        this.#collection.node.style.margin = '0 auto';
    }

    async #onQuery(query) {
        const searchParams = query.toSearchParams();
        const res = await this.#context.apiClient.get('/briefs/briefs?' + searchParams.toString(), query.toObject());
        return Query.responseFromObject({
            results: res.results,
            totalCount: res.total
        });
    }
}