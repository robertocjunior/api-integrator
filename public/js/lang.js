export default {
    "pt-BR": {
        app_title: "Hub Integrador Visual",
        sidebar: {
            my_flows: "Meus Fluxos",
            new_flow: "+ Novo Fluxo",
            save_all: "Salvar Tudo",
            saving: "Salvando...",
            unit_sec: "Seg",
            unit_min: "Min"
        },
        toolbar: {
            active: "Ativo",
            interval_title: "Intervalo de Execução",
            add_block: "+ Adicionar Bloco",
            req_http: "Requisição HTTP",
            manipulation: "Tratamento de Dados", // <--- ESTAVA FALTANDO AQUI
            wait: "Aguardar (Delay)"
        },
        canvas: {
            empty: "Adicione o primeiro bloco para começar",
            step_request: "Nova Requisição",
            step_wait: "Delay",
            step_manipulation: "Tratamento de Dados" // <--- E AQUI (Para o título do bloco)
        },
        block: {
            wait_label: "Tempo de espera (ms)",
            name_placeholder: "Nome do Passo",
            tab_headers: "Headers",
            tab_body: "Body",
            tab_vars: "Variáveis",
            btn_add_header: "+ Header",
            helper_vars: "Use {{VARIAVEL}} em URLs ou Headers.",
            btn_test: "Rodar Teste",
            saved_vars: "Variáveis Salvas:",
            click_to_save: "Clique num valor para salvar",
            manipulation_add: "+ Nova Regra",
            manipulation_type: "Tipo",
            manipulation_output: "Nome da Variável de Saída (Sem espaços)",
            manipulation_input: "Valor de Entrada / Expressão",
            ops: {
                template: "Texto / Concatenar",
                replace: "Substituir Texto",
                map: "Mapeamento (De -> Para)",
                format: "Formatação (Upper/Lower)",
                math: "Cálculo Matemático"
            }
        },
        modal: {
            title: "Salvar Variável",
            selected_value: "Valor selecionado:",
            path: "Caminho:",
            label_name: "Nome da Variável (sem espaços)",
            placeholder_name: "EX: TOKEN_AUTH",
            btn_save: "Salvar",
            btn_cancel: "Cancelar"
        },
        context_menu: {
            copy: "Copiar",
            paste: "Colar",
            insert_var: "Inserir Variável",
            no_vars: "Nenhuma variável salva"
        },
        errors: {
            test_error: "Erro ao testar: ",
            token_invalid: "Token inválido"
        }
    },
    "en-US": {
        // Futuro...
    }
};