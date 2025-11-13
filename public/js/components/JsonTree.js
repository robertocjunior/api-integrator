export default {
    template: `
    <div class="json-tree ps-3">
        <div v-for="(val, key) in data" :key="key">
            <span class="json-key" 
                  :class="{ 'text-decoration-underline': isArray(val) || !isObject(val) }"
                  style="cursor: pointer;"
                  @click.stop="handleClick(key, val)">
                "{{ key }}"
            </span>: 
            
            <span v-if="isObject(val)">
                <span v-if="isArray(val)">[ <br>
                    <json-tree v-for="(item, index) in val" :key="index" :data="item" :path="buildPath(key, index)" @select-path="$emit('select-path', $event)"></json-tree>
                ]</span>
                <span v-else>{ <br>
                    <json-tree :data="val" :path="buildPath(key)" @select-path="$emit('select-path', $event)"></json-tree>
                }</span>
            </span>
            <span v-else class="json-val" @click.stop="handleClick(key, val)">
                {{ formatVal(val) }}
            </span>
            <span>,</span>
        </div>
    </div>
    `,
    name: 'JsonTree',
    props: ['data', 'path'],
    emits: ['select-path'],
    methods: {
        isObject(val) { return val !== null && typeof val === 'object'; },
        isArray(val) { return Array.isArray(val); },
        formatVal(val) { return typeof val === 'string' ? `"${val}"` : val; },
        buildPath(key, index) {
            let prefix = this.path ? this.path + '.' : '';
            if (index !== undefined) return `${prefix}${key}[${index}]`;
            return prefix + key;
        },
        handleClick(key, val) {
            // ALTERAÇÃO AQUI: Permite clicar se NÃO for objeto OU se for um Array (Lista)
            if (!this.isObject(val) || this.isArray(val)) {
                // Se for array, passamos o caminho sem índice (ex: rows)
                // Se for valor, o caminho já veio construído
                const fullPath = this.buildPath(key);
                
                // Se clicou num array, envia o array inteiro como valor
                this.$emit('select-path', fullPath, val);
            }
        }
    }
};