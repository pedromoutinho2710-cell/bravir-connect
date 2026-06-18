export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      bling_tokens: {
        Row: {
          access_token: string
          created_at: string | null
          expires_at: string
          id: string
          refresh_token: string
          updated_at: string | null
        }
        Insert: {
          access_token: string
          created_at?: string | null
          expires_at: string
          id?: string
          refresh_token: string
          updated_at?: string | null
        }
        Update: {
          access_token?: string
          created_at?: string | null
          expires_at?: string
          id?: string
          refresh_token?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      bling_vendas: {
        Row: {
          created_at: string | null
          data: string
          id: number
          loja_id: number | null
          numero: string | null
          situacao_id: number | null
          total: number | null
          total_produtos: number | null
        }
        Insert: {
          created_at?: string | null
          data: string
          id: number
          loja_id?: number | null
          numero?: string | null
          situacao_id?: number | null
          total?: number | null
          total_produtos?: number | null
        }
        Update: {
          created_at?: string | null
          data?: string
          id?: number
          loja_id?: number | null
          numero?: string | null
          situacao_id?: number | null
          total?: number | null
          total_produtos?: number | null
        }
        Relationships: []
      }
      bolsao: {
        Row: {
          cliente_id: string
          created_at: string | null
          descricao: string | null
          id: string
          pedido_id: string | null
          tipo: string
          valor: number
        }
        Insert: {
          cliente_id: string
          created_at?: string | null
          descricao?: string | null
          id?: string
          pedido_id?: string | null
          tipo: string
          valor: number
        }
        Update: {
          cliente_id?: string
          created_at?: string | null
          descricao?: string | null
          id?: string
          pedido_id?: string | null
          tipo?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "bolsao_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bolsao_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      cadastros_pendentes: {
        Row: {
          bairro: string | null
          canal_ecommerce: string | null
          cep: string | null
          cidade: string | null
          classificacao: string | null
          cluster_sugerido: string | null
          cnpj: string
          contato_principal: string | null
          created_at: string | null
          email: string | null
          faturamento_mensal: string | null
          id: string
          link_ecommerce: string | null
          links_marketplace: string | null
          marcas_interesse: string[] | null
          motivo_reprovacao: string | null
          negativado: boolean | null
          nome_cliente: string
          numero: string | null
          observacoes: string | null
          origem: string | null
          percentual_b2b: string | null
          percentual_b2c: string | null
          perfil_atacado_distribuidor: string | null
          produtos_alivik: string[] | null
          produtos_bendita: string[] | null
          produtos_bravir: string[] | null
          produtos_laby: string[] | null
          qtd_lojas: string | null
          qtd_vendedores: string | null
          razao_social: string
          rua: string | null
          status: string | null
          telefone: string | null
          tem_ecommerce: boolean | null
          uf: string | null
          updated_at: string | null
          vende_digital: boolean | null
          vendedor_id: string | null
          vendedor_nome: string | null
        }
        Insert: {
          bairro?: string | null
          canal_ecommerce?: string | null
          cep?: string | null
          cidade?: string | null
          classificacao?: string | null
          cluster_sugerido?: string | null
          cnpj: string
          contato_principal?: string | null
          created_at?: string | null
          email?: string | null
          faturamento_mensal?: string | null
          id?: string
          link_ecommerce?: string | null
          links_marketplace?: string | null
          marcas_interesse?: string[] | null
          motivo_reprovacao?: string | null
          negativado?: boolean | null
          nome_cliente: string
          numero?: string | null
          observacoes?: string | null
          origem?: string | null
          percentual_b2b?: string | null
          percentual_b2c?: string | null
          perfil_atacado_distribuidor?: string | null
          produtos_alivik?: string[] | null
          produtos_bendita?: string[] | null
          produtos_bravir?: string[] | null
          produtos_laby?: string[] | null
          qtd_lojas?: string | null
          qtd_vendedores?: string | null
          razao_social: string
          rua?: string | null
          status?: string | null
          telefone?: string | null
          tem_ecommerce?: boolean | null
          uf?: string | null
          updated_at?: string | null
          vende_digital?: boolean | null
          vendedor_id?: string | null
          vendedor_nome?: string | null
        }
        Update: {
          bairro?: string | null
          canal_ecommerce?: string | null
          cep?: string | null
          cidade?: string | null
          classificacao?: string | null
          cluster_sugerido?: string | null
          cnpj?: string
          contato_principal?: string | null
          created_at?: string | null
          email?: string | null
          faturamento_mensal?: string | null
          id?: string
          link_ecommerce?: string | null
          links_marketplace?: string | null
          marcas_interesse?: string[] | null
          motivo_reprovacao?: string | null
          negativado?: boolean | null
          nome_cliente?: string
          numero?: string | null
          observacoes?: string | null
          origem?: string | null
          percentual_b2b?: string | null
          percentual_b2c?: string | null
          perfil_atacado_distribuidor?: string | null
          produtos_alivik?: string[] | null
          produtos_bendita?: string[] | null
          produtos_bravir?: string[] | null
          produtos_laby?: string[] | null
          qtd_lojas?: string | null
          qtd_vendedores?: string | null
          razao_social?: string
          rua?: string | null
          status?: string | null
          telefone?: string | null
          tem_ecommerce?: boolean | null
          uf?: string | null
          updated_at?: string | null
          vende_digital?: boolean | null
          vendedor_id?: string | null
          vendedor_nome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cadastros_pendentes_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      campanha_metas_clientes: {
        Row: {
          campanha_id: string | null
          cliente_id: string | null
          created_at: string | null
          id: string
          meta_valor: number
        }
        Insert: {
          campanha_id?: string | null
          cliente_id?: string | null
          created_at?: string | null
          id?: string
          meta_valor?: number
        }
        Update: {
          campanha_id?: string | null
          cliente_id?: string | null
          created_at?: string | null
          id?: string
          meta_valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "campanha_metas_clientes_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "campanhas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campanha_metas_clientes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      campanha_metas_vendedor: {
        Row: {
          campanha_id: string
          categoria: string | null
          created_at: string | null
          id: string
          meta_valor: number
          vendedor_id: string
        }
        Insert: {
          campanha_id: string
          categoria?: string | null
          created_at?: string | null
          id?: string
          meta_valor?: number
          vendedor_id: string
        }
        Update: {
          campanha_id?: string
          categoria?: string | null
          created_at?: string | null
          id?: string
          meta_valor?: number
          vendedor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campanha_metas_vendedor_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "campanhas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campanha_metas_vendedor_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      campanha_niveis: {
        Row: {
          campanha_id: string | null
          created_at: string | null
          descricao_premio: string
          id: string
          nome: string
          ordem: number
          valor_maximo: number | null
          valor_minimo: number
        }
        Insert: {
          campanha_id?: string | null
          created_at?: string | null
          descricao_premio: string
          id?: string
          nome: string
          ordem: number
          valor_maximo?: number | null
          valor_minimo: number
        }
        Update: {
          campanha_id?: string | null
          created_at?: string | null
          descricao_premio?: string
          id?: string
          nome?: string
          ordem?: number
          valor_maximo?: number | null
          valor_minimo?: number
        }
        Relationships: [
          {
            foreignKeyName: "campanha_niveis_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "campanhas"
            referencedColumns: ["id"]
          },
        ]
      }
      campanha_produtos: {
        Row: {
          campanha_id: string | null
          created_at: string | null
          id: string
          marca: string | null
          produto_id: string | null
          tipo: string
        }
        Insert: {
          campanha_id?: string | null
          created_at?: string | null
          id?: string
          marca?: string | null
          produto_id?: string | null
          tipo: string
        }
        Update: {
          campanha_id?: string | null
          created_at?: string | null
          id?: string
          marca?: string | null
          produto_id?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "campanha_produtos_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "campanhas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campanha_produtos_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      campanhas: {
        Row: {
          ativa: boolean | null
          categoria: string
          created_at: string | null
          data_fim: string | null
          data_inicio: string | null
          descricao: string | null
          id: string
          marcas: string[] | null
          nome: string
          tipo: string | null
          tipo_meta: string | null
          valor: number | null
        }
        Insert: {
          ativa?: boolean | null
          categoria?: string
          created_at?: string | null
          data_fim?: string | null
          data_inicio?: string | null
          descricao?: string | null
          id?: string
          marcas?: string[] | null
          nome: string
          tipo?: string | null
          tipo_meta?: string | null
          valor?: number | null
        }
        Update: {
          ativa?: boolean | null
          categoria?: string
          created_at?: string | null
          data_fim?: string | null
          data_inicio?: string | null
          descricao?: string | null
          id?: string
          marcas?: string[] | null
          nome?: string
          tipo?: string | null
          tipo_meta?: string | null
          valor?: number | null
        }
        Relationships: []
      }
      clientes: {
        Row: {
          aceita_saldo: boolean
          assumido_por: string | null
          aviso_pedido: string | null
          bairro: string | null
          campanha_id: string | null
          canal: string | null
          cep: string | null
          cidade: string | null
          cluster: string | null
          cnpj: string
          codigo_cliente: string | null
          codigo_parceiro: string | null
          comprador: string | null
          created_at: string | null
          data_proximo_contato: string | null
          deleted_at: string | null
          deleted_by: string | null
          desconto_adicional: number | null
          email: string | null
          etapa_pipeline: string | null
          grupo_cliente: string | null
          id: string
          imposto: number | null
          inscricao_estadual: string | null
          marcas_interesse: string[] | null
          motivo_perda: string | null
          negativado: boolean | null
          nome_fantasia: string | null
          nome_parceiro: string | null
          numero: string | null
          obs_comercial: string | null
          observacoes_trade: string | null
          pipeline_updated_at: string | null
          produtos_interesse: string | null
          proximo_passo: string | null
          razao_social: string
          rua: string | null
          status: string | null
          suframa: boolean | null
          tabela_preco: string | null
          telefone: string | null
          uf: string | null
          vendedor_id: string | null
        }
        Insert: {
          aceita_saldo?: boolean
          assumido_por?: string | null
          aviso_pedido?: string | null
          bairro?: string | null
          campanha_id?: string | null
          canal?: string | null
          cep?: string | null
          cidade?: string | null
          cluster?: string | null
          cnpj: string
          codigo_cliente?: string | null
          codigo_parceiro?: string | null
          comprador?: string | null
          created_at?: string | null
          data_proximo_contato?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          desconto_adicional?: number | null
          email?: string | null
          etapa_pipeline?: string | null
          grupo_cliente?: string | null
          id?: string
          imposto?: number | null
          inscricao_estadual?: string | null
          marcas_interesse?: string[] | null
          motivo_perda?: string | null
          negativado?: boolean | null
          nome_fantasia?: string | null
          nome_parceiro?: string | null
          numero?: string | null
          obs_comercial?: string | null
          observacoes_trade?: string | null
          pipeline_updated_at?: string | null
          produtos_interesse?: string | null
          proximo_passo?: string | null
          razao_social: string
          rua?: string | null
          status?: string | null
          suframa?: boolean | null
          tabela_preco?: string | null
          telefone?: string | null
          uf?: string | null
          vendedor_id?: string | null
        }
        Update: {
          aceita_saldo?: boolean
          assumido_por?: string | null
          aviso_pedido?: string | null
          bairro?: string | null
          campanha_id?: string | null
          canal?: string | null
          cep?: string | null
          cidade?: string | null
          cluster?: string | null
          cnpj?: string
          codigo_cliente?: string | null
          codigo_parceiro?: string | null
          comprador?: string | null
          created_at?: string | null
          data_proximo_contato?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          desconto_adicional?: number | null
          email?: string | null
          etapa_pipeline?: string | null
          grupo_cliente?: string | null
          id?: string
          imposto?: number | null
          inscricao_estadual?: string | null
          marcas_interesse?: string[] | null
          motivo_perda?: string | null
          negativado?: boolean | null
          nome_fantasia?: string | null
          nome_parceiro?: string | null
          numero?: string | null
          obs_comercial?: string | null
          observacoes_trade?: string | null
          pipeline_updated_at?: string | null
          produtos_interesse?: string | null
          proximo_passo?: string | null
          razao_social?: string
          rua?: string | null
          status?: string | null
          suframa?: boolean | null
          tabela_preco?: string | null
          telefone?: string | null
          uf?: string | null
          vendedor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clientes_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "campanhas"
            referencedColumns: ["id"]
          },
        ]
      }
      configuracoes: {
        Row: {
          key: string
          updated_at: string | null
          value: string
        }
        Insert: {
          key: string
          updated_at?: string | null
          value: string
        }
        Update: {
          key?: string
          updated_at?: string | null
          value?: string
        }
        Relationships: []
      }
      descontos: {
        Row: {
          id: string
          percentual_desconto: number
          perfil_cliente: string
          produto_id: string | null
        }
        Insert: {
          id?: string
          percentual_desconto: number
          perfil_cliente: string
          produto_id?: string | null
        }
        Update: {
          id?: string
          percentual_desconto?: number
          perfil_cliente?: string
          produto_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "descontos_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      faturamentos: {
        Row: {
          created_at: string
          faturado_em: string
          id: string
          nf_pdf_url: string | null
          nota_fiscal: string | null
          obs: string | null
          pedido_id: string
          rastreio: string | null
          usuario_id: string | null
        }
        Insert: {
          created_at?: string
          faturado_em?: string
          id?: string
          nf_pdf_url?: string | null
          nota_fiscal?: string | null
          obs?: string | null
          pedido_id: string
          rastreio?: string | null
          usuario_id?: string | null
        }
        Update: {
          created_at?: string
          faturado_em?: string
          id?: string
          nf_pdf_url?: string | null
          nota_fiscal?: string | null
          obs?: string | null
          pedido_id?: string
          rastreio?: string | null
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "faturamentos_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      faturamentos_sankhya: {
        Row: {
          aliq_ipi: number | null
          base_st: number | null
          canal: string | null
          cidade: string | null
          cod_grupo: string | null
          codigo_parceiro: string | null
          codigo_produto: string | null
          controle: string | null
          data_faturamento: string | null
          descricao_produto: string | null
          grupo: string | null
          grupo_cliente: string | null
          id: string
          importado_em: string | null
          importado_por: string | null
          ipi: number | null
          nome_parceiro: string | null
          nome_vendedor: string | null
          numero_nota: string
          quantidade: number | null
          razao_social_empresa: string | null
          recebimento_pedido: string | null
          segmento: string | null
          tipo_negociacao: string | null
          tipo_operacao: string | null
          uf: string | null
          valor_bruto: number | null
          valor_destaque: number | null
          valor_fem: number | null
          valor_liquido: number | null
          valor_st: number | null
          valor_total_itens: number | null
        }
        Insert: {
          aliq_ipi?: number | null
          base_st?: number | null
          canal?: string | null
          cidade?: string | null
          cod_grupo?: string | null
          codigo_parceiro?: string | null
          codigo_produto?: string | null
          controle?: string | null
          data_faturamento?: string | null
          descricao_produto?: string | null
          grupo?: string | null
          grupo_cliente?: string | null
          id?: string
          importado_em?: string | null
          importado_por?: string | null
          ipi?: number | null
          nome_parceiro?: string | null
          nome_vendedor?: string | null
          numero_nota: string
          quantidade?: number | null
          razao_social_empresa?: string | null
          recebimento_pedido?: string | null
          segmento?: string | null
          tipo_negociacao?: string | null
          tipo_operacao?: string | null
          uf?: string | null
          valor_bruto?: number | null
          valor_destaque?: number | null
          valor_fem?: number | null
          valor_liquido?: number | null
          valor_st?: number | null
          valor_total_itens?: number | null
        }
        Update: {
          aliq_ipi?: number | null
          base_st?: number | null
          canal?: string | null
          cidade?: string | null
          cod_grupo?: string | null
          codigo_parceiro?: string | null
          codigo_produto?: string | null
          controle?: string | null
          data_faturamento?: string | null
          descricao_produto?: string | null
          grupo?: string | null
          grupo_cliente?: string | null
          id?: string
          importado_em?: string | null
          importado_por?: string | null
          ipi?: number | null
          nome_parceiro?: string | null
          nome_vendedor?: string | null
          numero_nota?: string
          quantidade?: number | null
          razao_social_empresa?: string | null
          recebimento_pedido?: string | null
          segmento?: string | null
          tipo_negociacao?: string | null
          tipo_operacao?: string | null
          uf?: string | null
          valor_bruto?: number | null
          valor_destaque?: number | null
          valor_fem?: number | null
          valor_liquido?: number | null
          valor_st?: number | null
          valor_total_itens?: number | null
        }
        Relationships: []
      }
      formulario_produtos: {
        Row: {
          formulario_id: string
          id: string
          ordem: number
          produto_id: string
        }
        Insert: {
          formulario_id: string
          id?: string
          ordem?: number
          produto_id: string
        }
        Update: {
          formulario_id?: string
          id?: string
          ordem?: number
          produto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "formulario_produtos_formulario_id_fkey"
            columns: ["formulario_id"]
            isOneToOne: false
            referencedRelation: "formularios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "formulario_produtos_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      formularios: {
        Row: {
          ativo: boolean
          created_at: string
          created_by: string | null
          descricao: string | null
          id: string
          nome: string
          padrao: boolean
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          nome: string
          padrao?: boolean
        }
        Update: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          nome?: string
          padrao?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "formularios_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      historico_faturamento: {
        Row: {
          ano: number
          codigo_parceiro: string
          created_at: string | null
          id: string
          mes: number
          valor_total: number
        }
        Insert: {
          ano: number
          codigo_parceiro: string
          created_at?: string | null
          id?: string
          mes: number
          valor_total?: number
        }
        Update: {
          ano?: number
          codigo_parceiro?: string
          created_at?: string | null
          id?: string
          mes?: number
          valor_total?: number
        }
        Relationships: []
      }
      historico_status: {
        Row: {
          acao: string | null
          created_at: string | null
          id: string
          observacao: string | null
          pedido_id: string | null
          status_anterior: string | null
          status_novo: string | null
          usuario_email: string | null
          usuario_id: string | null
          usuario_nome: string | null
        }
        Insert: {
          acao?: string | null
          created_at?: string | null
          id?: string
          observacao?: string | null
          pedido_id?: string | null
          status_anterior?: string | null
          status_novo?: string | null
          usuario_email?: string | null
          usuario_id?: string | null
          usuario_nome?: string | null
        }
        Update: {
          acao?: string | null
          created_at?: string | null
          id?: string
          observacao?: string | null
          pedido_id?: string | null
          status_anterior?: string | null
          status_novo?: string | null
          usuario_email?: string | null
          usuario_id?: string | null
          usuario_nome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "historico_status_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      impostos_produto: {
        Row: {
          codigo_jiva: string
          id: string
          ipi: number
          st: number
          uf: string
        }
        Insert: {
          codigo_jiva: string
          id?: string
          ipi?: number
          st?: number
          uf: string
        }
        Update: {
          codigo_jiva?: string
          id?: string
          ipi?: number
          st?: number
          uf?: string
        }
        Relationships: []
      }
      itens_faturados: {
        Row: {
          created_at: string
          faturamento_id: string
          id: string
          item_pedido_id: string
          pedido_id: string
          quantidade_faturada: number
        }
        Insert: {
          created_at?: string
          faturamento_id: string
          id?: string
          item_pedido_id: string
          pedido_id: string
          quantidade_faturada: number
        }
        Update: {
          created_at?: string
          faturamento_id?: string
          id?: string
          item_pedido_id?: string
          pedido_id?: string
          quantidade_faturada?: number
        }
        Relationships: [
          {
            foreignKeyName: "itens_faturados_faturamento_id_fkey"
            columns: ["faturamento_id"]
            isOneToOne: false
            referencedRelation: "faturamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itens_faturados_item_pedido_id_fkey"
            columns: ["item_pedido_id"]
            isOneToOne: false
            referencedRelation: "itens_pedido"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itens_faturados_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      itens_pedido: {
        Row: {
          desconto_comercial: number | null
          desconto_perfil: number | null
          desconto_trade: number | null
          id: string
          pedido_id: string | null
          preco_apos_comercial: number | null
          preco_apos_perfil: number | null
          preco_final: number | null
          preco_unitario_bruto: number | null
          preco_unitario_liquido: number | null
          produto_id: string | null
          qtd_faturada: number | null
          quantidade: number
          total_item: number | null
        }
        Insert: {
          desconto_comercial?: number | null
          desconto_perfil?: number | null
          desconto_trade?: number | null
          id?: string
          pedido_id?: string | null
          preco_apos_comercial?: number | null
          preco_apos_perfil?: number | null
          preco_final?: number | null
          preco_unitario_bruto?: number | null
          preco_unitario_liquido?: number | null
          produto_id?: string | null
          qtd_faturada?: number | null
          quantidade: number
          total_item?: number | null
        }
        Update: {
          desconto_comercial?: number | null
          desconto_perfil?: number | null
          desconto_trade?: number | null
          id?: string
          pedido_id?: string | null
          preco_apos_comercial?: number | null
          preco_apos_perfil?: number | null
          preco_final?: number | null
          preco_unitario_bruto?: number | null
          preco_unitario_liquido?: number | null
          produto_id?: string | null
          qtd_faturada?: number | null
          quantidade?: number
          total_item?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "itens_pedido_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itens_pedido_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      leads_evento: {
        Row: {
          areas_atuacao: string[] | null
          cidade: string | null
          cliente_id: string | null
          contato_nome: string | null
          created_at: string | null
          email: string | null
          id: string
          marcas_interesse: string[] | null
          nome_fantasia: string | null
          observacoes: string | null
          origem: string
          produtos_interesse: string[] | null
          razao_social: string | null
          status: string
          telefone: string | null
          uf: string | null
          vendedor_atribuido_id: string | null
        }
        Insert: {
          areas_atuacao?: string[] | null
          cidade?: string | null
          cliente_id?: string | null
          contato_nome?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          marcas_interesse?: string[] | null
          nome_fantasia?: string | null
          observacoes?: string | null
          origem?: string
          produtos_interesse?: string[] | null
          razao_social?: string | null
          status?: string
          telefone?: string | null
          uf?: string | null
          vendedor_atribuido_id?: string | null
        }
        Update: {
          areas_atuacao?: string[] | null
          cidade?: string | null
          cliente_id?: string | null
          contato_nome?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          marcas_interesse?: string[] | null
          nome_fantasia?: string | null
          observacoes?: string | null
          origem?: string
          produtos_interesse?: string[] | null
          razao_social?: string | null
          status?: string
          telefone?: string | null
          uf?: string | null
          vendedor_atribuido_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_evento_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      metas: {
        Row: {
          ano: number | null
          created_at: string | null
          id: string
          mes: number | null
          valor_meta_reais: number | null
          valor_meta_skus: number | null
          vendedor_id: string | null
        }
        Insert: {
          ano?: number | null
          created_at?: string | null
          id?: string
          mes?: number | null
          valor_meta_reais?: number | null
          valor_meta_skus?: number | null
          vendedor_id?: string | null
        }
        Update: {
          ano?: number | null
          created_at?: string | null
          id?: string
          mes?: number | null
          valor_meta_reais?: number | null
          valor_meta_skus?: number | null
          vendedor_id?: string | null
        }
        Relationships: []
      }
      metas_globais: {
        Row: {
          ano: number
          created_at: string | null
          id: string
          mes: number
          valor_meta_reais: number
        }
        Insert: {
          ano: number
          created_at?: string | null
          id?: string
          mes: number
          valor_meta_reais?: number
        }
        Update: {
          ano?: number
          created_at?: string | null
          id?: string
          mes?: number
          valor_meta_reais?: number
        }
        Relationships: []
      }
      metas_visao_macro: {
        Row: {
          ano: number
          created_at: string | null
          id: string
          mes: number
          meta_b2b: number | null
          meta_marca_propria: number | null
          meta_online: number | null
          updated_at: string | null
        }
        Insert: {
          ano: number
          created_at?: string | null
          id?: string
          mes: number
          meta_b2b?: number | null
          meta_marca_propria?: number | null
          meta_online?: number | null
          updated_at?: string | null
        }
        Update: {
          ano?: number
          created_at?: string | null
          id?: string
          mes?: number
          meta_b2b?: number | null
          meta_marca_propria?: number | null
          meta_online?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      notificacoes: {
        Row: {
          created_at: string | null
          destinatario_id: string | null
          destinatario_role: string
          id: string
          lida: boolean | null
          mensagem: string | null
          pedido_id: string | null
          tipo: string | null
          titulo: string | null
        }
        Insert: {
          created_at?: string | null
          destinatario_id?: string | null
          destinatario_role: string
          id?: string
          lida?: boolean | null
          mensagem?: string | null
          pedido_id?: string | null
          tipo?: string | null
          titulo?: string | null
        }
        Update: {
          created_at?: string | null
          destinatario_id?: string | null
          destinatario_role?: string
          id?: string
          lida?: boolean | null
          mensagem?: string | null
          pedido_id?: string | null
          tipo?: string | null
          titulo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notificacoes_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos: {
        Row: {
          agendamento: boolean | null
          cliente_id: string | null
          comprador: string | null
          comprovante_url: string | null
          cond_pagamento: string | null
          created_at: string | null
          criado_por_id: string | null
          data_pedido: string | null
          deleted_at: string | null
          deleted_by: string | null
          desconto_vista: number | null
          email: string | null
          faturado_em: string | null
          flag_prioridade: string | null
          id: string
          motivo: string | null
          numero_pedido: number
          observacoes: string | null
          ordem_compra: string | null
          pagamento_vista: boolean
          pedido_origem_id: string | null
          perfil_cliente: string | null
          responsavel_id: string | null
          status: string | null
          status_atualizado_em: string | null
          tabela_preco: string | null
          telefone: string | null
          tipo: string | null
          total: number | null
          vendedor_id: string | null
          vigencia_id: string | null
        }
        Insert: {
          agendamento?: boolean | null
          cliente_id?: string | null
          comprador?: string | null
          comprovante_url?: string | null
          cond_pagamento?: string | null
          created_at?: string | null
          criado_por_id?: string | null
          data_pedido?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          desconto_vista?: number | null
          email?: string | null
          faturado_em?: string | null
          flag_prioridade?: string | null
          id?: string
          motivo?: string | null
          numero_pedido?: number
          observacoes?: string | null
          ordem_compra?: string | null
          pagamento_vista?: boolean
          pedido_origem_id?: string | null
          perfil_cliente?: string | null
          responsavel_id?: string | null
          status?: string | null
          status_atualizado_em?: string | null
          tabela_preco?: string | null
          telefone?: string | null
          tipo?: string | null
          total?: number | null
          vendedor_id?: string | null
          vigencia_id?: string | null
        }
        Update: {
          agendamento?: boolean | null
          cliente_id?: string | null
          comprador?: string | null
          comprovante_url?: string | null
          cond_pagamento?: string | null
          created_at?: string | null
          criado_por_id?: string | null
          data_pedido?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          desconto_vista?: number | null
          email?: string | null
          faturado_em?: string | null
          flag_prioridade?: string | null
          id?: string
          motivo?: string | null
          numero_pedido?: number
          observacoes?: string | null
          ordem_compra?: string | null
          pagamento_vista?: boolean
          pedido_origem_id?: string | null
          perfil_cliente?: string | null
          responsavel_id?: string | null
          status?: string | null
          status_atualizado_em?: string | null
          tabela_preco?: string | null
          telefone?: string | null
          tipo?: string | null
          total?: number | null
          vendedor_id?: string | null
          vigencia_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_pedido_origem_id_fkey"
            columns: ["pedido_origem_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_vigencia_id_fkey"
            columns: ["vigencia_id"]
            isOneToOne: false
            referencedRelation: "tabelas_vigencia"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_contatos: {
        Row: {
          cliente_id: string | null
          created_at: string | null
          id: string
          nota: string | null
          tipo: string
          vendedor_id: string | null
        }
        Insert: {
          cliente_id?: string | null
          created_at?: string | null
          id?: string
          nota?: string | null
          tipo: string
          vendedor_id?: string | null
        }
        Update: {
          cliente_id?: string | null
          created_at?: string | null
          id?: string
          nota?: string | null
          tipo?: string
          vendedor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_contatos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_contatos_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      precos: {
        Row: {
          id: string
          preco_bruto: number
          produto_id: string | null
          tabela: string | null
          vigencia_id: string | null
        }
        Insert: {
          id?: string
          preco_bruto: number
          produto_id?: string | null
          tabela?: string | null
          vigencia_id?: string | null
        }
        Update: {
          id?: string
          preco_bruto?: number
          produto_id?: string | null
          tabela?: string | null
          vigencia_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "precos_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "precos_vigencia_id_fkey"
            columns: ["vigencia_id"]
            isOneToOne: false
            referencedRelation: "tabelas_vigencia"
            referencedColumns: ["id"]
          },
        ]
      }
      precos_cliente_produto: {
        Row: {
          codigo_parceiro: string | null
          codigo_produto: string | null
          created_at: string | null
          desconto_perfil: number | null
          id: string
          origem: string
          preco_unitario: number | null
        }
        Insert: {
          codigo_parceiro?: string | null
          codigo_produto?: string | null
          created_at?: string | null
          desconto_perfil?: number | null
          id?: string
          origem?: string
          preco_unitario?: number | null
        }
        Update: {
          codigo_parceiro?: string | null
          codigo_produto?: string | null
          created_at?: string | null
          desconto_perfil?: number | null
          id?: string
          origem?: string
          preco_unitario?: number | null
        }
        Relationships: []
      }
      produtos: {
        Row: {
          ativo: boolean | null
          codigo_jiva: string
          created_at: string | null
          cx_embarque: number | null
          disponivel: boolean
          id: string
          marca: string | null
          nome: string
          peso_unitario: number | null
        }
        Insert: {
          ativo?: boolean | null
          codigo_jiva: string
          created_at?: string | null
          cx_embarque?: number | null
          disponivel?: boolean
          id?: string
          marca?: string | null
          nome: string
          peso_unitario?: number | null
        }
        Update: {
          ativo?: boolean | null
          codigo_jiva?: string
          created_at?: string | null
          cx_embarque?: number | null
          disponivel?: boolean
          id?: string
          marca?: string | null
          nome?: string
          peso_unitario?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          ativo: boolean | null
          avatar_url: string | null
          created_at: string | null
          email: string
          full_name: string | null
          id: string
          meta_mensal: number | null
          name: string
          nome_sankhya: string | null
          pedido_minimo: number | null
          role: string
        }
        Insert: {
          ativo?: boolean | null
          avatar_url?: string | null
          created_at?: string | null
          email: string
          full_name?: string | null
          id: string
          meta_mensal?: number | null
          name: string
          nome_sankhya?: string | null
          pedido_minimo?: number | null
          role: string
        }
        Update: {
          ativo?: boolean | null
          avatar_url?: string | null
          created_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          meta_mensal?: number | null
          name?: string
          nome_sankhya?: string | null
          pedido_minimo?: number | null
          role?: string
        }
        Relationships: []
      }
      propostas: {
        Row: {
          cliente_id: string
          created_at: string | null
          desconto_avista: number | null
          id: string
          mensagem: string | null
          order_bump_aceito: boolean | null
          order_bump_desconto: number | null
          order_bump_produto_id: string | null
          order_bump_quantidade: number | null
          pedido_id: string
          respondida_em: string | null
          status: string
          token: string
          validade_em: string
          vendedor_id: string
        }
        Insert: {
          cliente_id: string
          created_at?: string | null
          desconto_avista?: number | null
          id?: string
          mensagem?: string | null
          order_bump_aceito?: boolean | null
          order_bump_desconto?: number | null
          order_bump_produto_id?: string | null
          order_bump_quantidade?: number | null
          pedido_id: string
          respondida_em?: string | null
          status?: string
          token?: string
          validade_em: string
          vendedor_id: string
        }
        Update: {
          cliente_id?: string
          created_at?: string | null
          desconto_avista?: number | null
          id?: string
          mensagem?: string | null
          order_bump_aceito?: boolean | null
          order_bump_desconto?: number | null
          order_bump_produto_id?: string | null
          order_bump_quantidade?: number | null
          pedido_id?: string
          respondida_em?: string | null
          status?: string
          token?: string
          validade_em?: string
          vendedor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "propostas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propostas_order_bump_produto_id_fkey"
            columns: ["order_bump_produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propostas_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          cliente_cnpj: string | null
          cliente_email: string | null
          cliente_nome: string
          cliente_tel: string | null
          created_at: string | null
          id: string
          valor: number
          vendedor_nome: string
        }
        Insert: {
          cliente_cnpj?: string | null
          cliente_email?: string | null
          cliente_nome: string
          cliente_tel?: string | null
          created_at?: string | null
          id?: string
          valor: number
          vendedor_nome: string
        }
        Update: {
          cliente_cnpj?: string | null
          cliente_email?: string | null
          cliente_nome?: string
          cliente_tel?: string | null
          created_at?: string | null
          id?: string
          valor?: number
          vendedor_nome?: string
        }
        Relationships: []
      }
      simulacoes_margem: {
        Row: {
          cliente_id: string | null
          cluster: string | null
          created_at: string | null
          id: string
          itens: Json
          mensagem: string | null
          nome_prospect: string | null
          tabela_preco: string | null
          token: string
          vendedor_id: string
        }
        Insert: {
          cliente_id?: string | null
          cluster?: string | null
          created_at?: string | null
          id?: string
          itens?: Json
          mensagem?: string | null
          nome_prospect?: string | null
          tabela_preco?: string | null
          token?: string
          vendedor_id: string
        }
        Update: {
          cliente_id?: string | null
          cluster?: string | null
          created_at?: string | null
          id?: string
          itens?: Json
          mensagem?: string | null
          nome_prospect?: string | null
          tabela_preco?: string | null
          token?: string
          vendedor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "simulacoes_margem_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      solicitacoes_analise: {
        Row: {
          cliente_id: string | null
          created_at: string | null
          id: string
          observacoes: string | null
          status: string | null
        }
        Insert: {
          cliente_id?: string | null
          created_at?: string | null
          id?: string
          observacoes?: string | null
          status?: string | null
        }
        Update: {
          cliente_id?: string | null
          created_at?: string | null
          id?: string
          observacoes?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "solicitacoes_analise_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      solicitacoes_gestor: {
        Row: {
          chat_historico: Json | null
          created_at: string | null
          criado_por: string | null
          criado_por_nome: string | null
          deleted_at: string | null
          deleted_by: string | null
          descricao: string
          id: string
          link_teste: string | null
          mockup_prompt: string | null
          motivo: string | null
          motivo_devolucao: string | null
          prioridade: string
          status: string
          tela: string | null
          tipo: string
          titulo: string | null
        }
        Insert: {
          chat_historico?: Json | null
          created_at?: string | null
          criado_por?: string | null
          criado_por_nome?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          descricao: string
          id?: string
          link_teste?: string | null
          mockup_prompt?: string | null
          motivo?: string | null
          motivo_devolucao?: string | null
          prioridade?: string
          status?: string
          tela?: string | null
          tipo: string
          titulo?: string | null
        }
        Update: {
          chat_historico?: Json | null
          created_at?: string | null
          criado_por?: string | null
          criado_por_nome?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          descricao?: string
          id?: string
          link_teste?: string | null
          mockup_prompt?: string | null
          motivo?: string | null
          motivo_devolucao?: string | null
          prioridade?: string
          status?: string
          tela?: string | null
          tipo?: string
          titulo?: string | null
        }
        Relationships: []
      }
      tabelas_vigencia: {
        Row: {
          ativa: boolean | null
          created_at: string | null
          desconto_livre: boolean | null
          descricao: string | null
          id: string
          nome: string
        }
        Insert: {
          ativa?: boolean | null
          created_at?: string | null
          desconto_livre?: boolean | null
          descricao?: string | null
          id?: string
          nome: string
        }
        Update: {
          ativa?: boolean | null
          created_at?: string | null
          desconto_livre?: boolean | null
          descricao?: string | null
          id?: string
          nome?: string
        }
        Relationships: []
      }
      tarefas: {
        Row: {
          cliente_id: string | null
          concluida: boolean | null
          created_at: string | null
          data_vencimento: string | null
          descricao: string | null
          id: string
          tipo: string | null
          titulo: string
          vendedor_id: string | null
        }
        Insert: {
          cliente_id?: string | null
          concluida?: boolean | null
          created_at?: string | null
          data_vencimento?: string | null
          descricao?: string | null
          id?: string
          tipo?: string | null
          titulo: string
          vendedor_id?: string | null
        }
        Update: {
          cliente_id?: string | null
          concluida?: boolean | null
          created_at?: string | null
          data_vencimento?: string | null
          descricao?: string | null
          id?: string
          tipo?: string | null
          titulo?: string
          vendedor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tarefas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          role?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      vendedor_ltv_clientes: {
        Row: {
          cliente_id: string | null
          data_ultimo_pedido: string | null
          dias_sem_comprar: number | null
          ltv: number | null
          nome: string | null
          valor_ultimo_pedido: number | null
          vendedor_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      has_role: { Args: { role: string; user_id: string }; Returns: boolean }
      vendedor_ltv_clientes: {
        Args: { _vendedor_id: string }
        Returns: {
          cliente_id: string
          dias_sem_compra: number
          ltv: number
          razao_social: string
          ultima_compra: string
        }[]
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "vendedor"
        | "faturamento"
        | "logistica"
        | "trade"
        | "gestora"
        | "gestora_faturamento"
        | "financeiro"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "admin",
        "vendedor",
        "faturamento",
        "logistica",
        "trade",
        "gestora",
        "gestora_faturamento",
        "financeiro",
      ],
    },
  },
} as const
