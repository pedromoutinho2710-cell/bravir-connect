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
      campanhas: {
        Row: {
          ativa: boolean
          created_at: string
          data_fim: string | null
          data_inicio: string | null
          descricao: string | null
          id: string
          nome: string
          tipo: string | null
          valor: number | null
        }
        Insert: {
          ativa?: boolean
          created_at?: string
          data_fim?: string | null
          data_inicio?: string | null
          descricao?: string | null
          id?: string
          nome: string
          tipo?: string | null
          valor?: number | null
        }
        Update: {
          ativa?: boolean
          created_at?: string
          data_fim?: string | null
          data_inicio?: string | null
          descricao?: string | null
          id?: string
          nome?: string
          tipo?: string | null
          valor?: number | null
        }
        Relationships: []
      }
      clientes: {
        Row: {
          aceita_saldo: boolean
          assumido_por: string | null
          bairro: string | null
          campanha_id: string | null
          canal: string | null
          cep: string | null
          cidade: string | null
          cnpj: string
          codigo_cliente: string | null
          codigo_parceiro: string | null
          comprador: string | null
          created_at: string
          desconto_adicional: number | null
          email: string | null
          id: string
          imposto: number | null
          inscricao_estadual: string | null
          negativado: boolean | null
          nome_parceiro: string | null
          numero: string | null
          observacoes_trade: string | null
          cluster: string | null
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
          bairro?: string | null
          campanha_id?: string | null
          canal?: string | null
          cep?: string | null
          cidade?: string | null
          cnpj: string
          codigo_cliente?: string | null
          codigo_parceiro?: string | null
          comprador?: string | null
          created_at?: string
          desconto_adicional?: number | null
          email?: string | null
          id?: string
          imposto?: number | null
          inscricao_estadual?: string | null
          negativado?: boolean | null
          nome_parceiro?: string | null
          numero?: string | null
          observacoes_trade?: string | null
          cluster?: string | null
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
          bairro?: string | null
          campanha_id?: string | null
          canal?: string | null
          cep?: string | null
          cidade?: string | null
          cnpj?: string
          codigo_cliente?: string | null
          codigo_parceiro?: string | null
          comprador?: string | null
          created_at?: string
          desconto_adicional?: number | null
          email?: string | null
          id?: string
          imposto?: number | null
          inscricao_estadual?: string | null
          negativado?: boolean | null
          nome_parceiro?: string | null
          numero?: string | null
          observacoes_trade?: string | null
          cluster?: string | null
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
      descontos: {
        Row: {
          id: string
          percentual_desconto: number
          cluster: string
          produto_id: string
        }
        Insert: {
          id?: string
          percentual_desconto?: number
          cluster: string
          produto_id: string
        }
        Update: {
          id?: string
          percentual_desconto?: number
          cluster?: string
          produto_id?: string
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
      itens_pedido: {
        Row: {
          bolsao: number
          desconto_comercial: number | null
          desconto_trade: number | null
          id: string
          pedido_id: string
          preco_apos_comercial: number | null
          preco_apos_perfil: number | null
          preco_final: number | null
          preco_unitario_bruto: number
          preco_unitario_liquido: number | null
          produto_id: string
          quantidade: number
          total_item: number
        }
        Insert: {
          bolsao?: number
          desconto_comercial?: number | null
          desconto_trade?: number | null
          id?: string
          pedido_id: string
          preco_apos_comercial?: number | null
          preco_apos_perfil?: number | null
          preco_final?: number | null
          preco_unitario_bruto: number
          preco_unitario_liquido?: number | null
          produto_id: string
          quantidade: number
          total_item: number
        }
        Update: {
          bolsao?: number
          desconto_comercial?: number | null
          desconto_trade?: number | null
          id?: string
          pedido_id?: string
          preco_apos_comercial?: number | null
          preco_apos_perfil?: number | null
          preco_final?: number | null
          preco_unitario_bruto?: number
          preco_unitario_liquido?: number | null
          produto_id?: string
          quantidade?: number
          total_item?: number
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
      metas: {
        Row: {
          ano: number
          created_at: string
          id: string
          mes: number
          valor_meta_reais: number
          vendedor_id: string | null
        }
        Insert: {
          ano: number
          created_at?: string
          id?: string
          mes: number
          valor_meta_reais?: number
          vendedor_id?: string | null
        }
        Update: {
          ano?: number
          created_at?: string
          id?: string
          mes?: number
          valor_meta_reais?: number
          vendedor_id?: string | null
        }
        Relationships: []
      }
      notificacoes: {
        Row: {
          created_at: string
          destinatario_id: string | null
          destinatario_role: string
          id: string
          lida: boolean
          mensagem: string | null
          pedido_id: string | null
          tipo: string | null
        }
        Insert: {
          created_at?: string
          destinatario_id?: string | null
          destinatario_role: string
          id?: string
          lida?: boolean
          mensagem?: string | null
          pedido_id?: string | null
          tipo?: string | null
        }
        Update: {
          created_at?: string
          destinatario_id?: string | null
          destinatario_role?: string
          id?: string
          lida?: boolean
          mensagem?: string | null
          pedido_id?: string | null
          tipo?: string | null
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
          agendamento: boolean
          cliente_id: string
          cond_pagamento: string | null
          created_at: string
          data_pedido: string
          faturado_em: string | null
          id: string
          motivo: string | null
          nf_pdf_url: string | null
          nota_fiscal: string | null
          numero_pedido: number
          obs_faturamento: string | null
          observacoes: string | null
          perfil_cliente: string
          rastreio: string | null
          responsavel_id: string | null
          status: string
          tabela_preco: string
          tipo: string
          vendedor_id: string
        }
        Insert: {
          agendamento?: boolean
          cliente_id: string
          cond_pagamento?: string | null
          created_at?: string
          data_pedido?: string
          faturado_em?: string | null
          id?: string
          motivo?: string | null
          nf_pdf_url?: string | null
          nota_fiscal?: string | null
          numero_pedido?: number
          obs_faturamento?: string | null
          observacoes?: string | null
          perfil_cliente: string
          rastreio?: string | null
          responsavel_id?: string | null
          status?: string
          tabela_preco: string
          tipo?: string
          vendedor_id: string
        }
        Update: {
          agendamento?: boolean
          cliente_id?: string
          cond_pagamento?: string | null
          created_at?: string
          data_pedido?: string
          faturado_em?: string | null
          id?: string
          motivo?: string | null
          nf_pdf_url?: string | null
          nota_fiscal?: string | null
          numero_pedido?: number
          obs_faturamento?: string | null
          observacoes?: string | null
          perfil_cliente?: string
          rastreio?: string | null
          responsavel_id?: string | null
          status?: string
          tabela_preco?: string
          tipo?: string
          vendedor_id?: string
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
      precos: {
        Row: {
          id: string
          preco_bruto: number
          produto_id: string
          tabela: string
        }
        Insert: {
          id?: string
          preco_bruto: number
          produto_id: string
          tabela: string
        }
        Update: {
          id?: string
          preco_bruto?: number
          produto_id?: string
          tabela?: string
        }
        Relationships: [
          {
            foreignKeyName: "precos_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      produtos: {
        Row: {
          ativo: boolean
          codigo_jiva: string
          cx_embarque: number
          id: string
          marca: string
          nome: string
          peso_unitario: number
        }
        Insert: {
          ativo?: boolean
          codigo_jiva: string
          cx_embarque?: number
          id?: string
          marca: string
          nome: string
          peso_unitario?: number
        }
        Update: {
          ativo?: boolean
          codigo_jiva?: string
          cx_embarque?: number
          id?: string
          marca?: string
          nome?: string
          peso_unitario?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          ativo: boolean | null
          created_at: string
          email: string
          full_name: string | null
          id: string
        }
        Insert: {
          ativo?: boolean | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
        }
        Update: {
          ativo?: boolean | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      tarefas: {
        Row: {
          cliente_id: string | null
          concluida: boolean
          created_at: string
          data_vencimento: string | null
          descricao: string | null
          id: string
          titulo: string
          vendedor_id: string | null
        }
        Insert: {
          cliente_id?: string | null
          concluida?: boolean
          created_at?: string
          data_vencimento?: string | null
          descricao?: string | null
          id?: string
          titulo: string
          vendedor_id?: string | null
        }
        Update: {
          cliente_id?: string | null
          concluida?: boolean
          created_at?: string
          data_vencimento?: string | null
          descricao?: string | null
          id?: string
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
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      vendedor_ltv_clientes: {
        Args: { _vendedor_id: string }
        Returns: {
          cliente_id: string
          razao_social: string
          ltv: number
          ultima_compra: string
          dias_sem_compra: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "vendedor" | "faturamento" | "logistica" | "trade"
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
      app_role: ["admin", "vendedor", "faturamento", "logistica", "trade"],
    },
  },
} as const
