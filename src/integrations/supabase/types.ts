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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      ai_suggestions: {
        Row: {
          confidence: string | null
          created_at: string
          id: string
          job_id: string
          kind: string
          payload: Json
          state: string
          user_id: string
        }
        Insert: {
          confidence?: string | null
          created_at?: string
          id?: string
          job_id: string
          kind: string
          payload?: Json
          state?: string
          user_id?: string
        }
        Update: {
          confidence?: string | null
          created_at?: string
          id?: string
          job_id?: string
          kind?: string
          payload?: Json
          state?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_suggestions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      bexio_sync: {
        Row: {
          bexio_id: string | null
          created_at: string
          entity: string
          entity_id: string
          id: string
          status: string
          user_id: string
        }
        Insert: {
          bexio_id?: string | null
          created_at?: string
          entity: string
          entity_id: string
          id?: string
          status?: string
          user_id?: string
        }
        Update: {
          bexio_id?: string | null
          created_at?: string
          entity?: string
          entity_id?: string
          id?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      cost_estimate_items: {
        Row: {
          amount: number
          created_at: string
          description: string
          estimate_id: string
          id: string
          section: string
          sort_order: number
          user_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          description?: string
          estimate_id: string
          id?: string
          section?: string
          sort_order?: number
          user_id?: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string
          estimate_id?: string
          id?: string
          section?: string
          sort_order?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cost_estimate_items_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "cost_estimates"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_estimates: {
        Row: {
          confidence: string
          created_at: string
          id: string
          job_id: string
          notes: string | null
          tolerance: number
          updated_at: string
          user_id: string
          version: number
          visibility: string
        }
        Insert: {
          confidence?: string
          created_at?: string
          id?: string
          job_id: string
          notes?: string | null
          tolerance?: number
          updated_at?: string
          user_id?: string
          version?: number
          visibility?: string
        }
        Update: {
          confidence?: string
          created_at?: string
          id?: string
          job_id?: string
          notes?: string | null
          tolerance?: number
          updated_at?: string
          user_id?: string
          version?: number
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "cost_estimates_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          city: string | null
          company_name: string | null
          created_at: string
          email: string | null
          first_name: string | null
          id: string
          last_name: string | null
          notes: string | null
          phone: string | null
          street: string | null
          updated_at: string
          user_id: string
          zip: string | null
        }
        Insert: {
          city?: string | null
          company_name?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          notes?: string | null
          phone?: string | null
          street?: string | null
          updated_at?: string
          user_id?: string
          zip?: string | null
        }
        Update: {
          city?: string | null
          company_name?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          notes?: string | null
          phone?: string | null
          street?: string | null
          updated_at?: string
          user_id?: string
          zip?: string | null
        }
        Relationships: []
      }
      job_documents: {
        Row: {
          created_at: string
          description: string | null
          file_name: string
          file_type: string
          id: string
          job_id: string
          mime_type: string | null
          storage_path: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          file_name?: string
          file_type?: string
          id?: string
          job_id: string
          mime_type?: string | null
          storage_path: string
          user_id?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          file_name?: string
          file_type?: string
          id?: string
          job_id?: string
          mime_type?: string | null
          storage_path?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_documents_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_photos: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          id: string
          job_id: string
          storage_path: string
          taken_at: string
          user_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          job_id: string
          storage_path: string
          taken_at?: string
          user_id?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          job_id?: string
          storage_path?: string
          taken_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_photos_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          appointment_at: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          city: string | null
          completed_at: string | null
          completion_notes: string | null
          created_at: string
          customer_id: string | null
          customer_request: string | null
          id: string
          internal_notes: string | null
          job_type: string
          lifecycle_status: string
          notes: string | null
          problem_description: string | null
          report_created_at: string | null
          report_number: string | null
          signature_path: string | null
          status: string
          street: string | null
          title: string
          updated_at: string
          user_id: string
          work_confirmed: boolean
          zip: string | null
        }
        Insert: {
          appointment_at?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          city?: string | null
          completed_at?: string | null
          completion_notes?: string | null
          created_at?: string
          customer_id?: string | null
          customer_request?: string | null
          id?: string
          internal_notes?: string | null
          job_type?: string
          lifecycle_status?: string
          notes?: string | null
          problem_description?: string | null
          report_created_at?: string | null
          report_number?: string | null
          signature_path?: string | null
          status?: string
          street?: string | null
          title: string
          updated_at?: string
          user_id?: string
          work_confirmed?: boolean
          zip?: string | null
        }
        Update: {
          appointment_at?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          city?: string | null
          completed_at?: string | null
          completion_notes?: string | null
          created_at?: string
          customer_id?: string | null
          customer_request?: string | null
          id?: string
          internal_notes?: string | null
          job_type?: string
          lifecycle_status?: string
          notes?: string | null
          problem_description?: string | null
          report_created_at?: string | null
          report_number?: string | null
          signature_path?: string | null
          status?: string
          street?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          work_confirmed?: boolean
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      labour_items: {
        Row: {
          confidence: string | null
          created_at: string
          description: string
          hourly_rate: number
          hours: number
          id: string
          job_id: string
          notes: string | null
          sort_order: number
          source: string
          updated_at: string
          user_id: string
        }
        Insert: {
          confidence?: string | null
          created_at?: string
          description?: string
          hourly_rate?: number
          hours?: number
          id?: string
          job_id: string
          notes?: string | null
          sort_order?: number
          source?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          confidence?: string | null
          created_at?: string
          description?: string
          hourly_rate?: number
          hours?: number
          id?: string
          job_id?: string
          notes?: string | null
          sort_order?: number
          source?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "labour_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      labour_time_entries: {
        Row: {
          created_at: string
          end_at: string | null
          hours: number
          id: string
          job_id: string
          labour_item_id: string
          notes: string | null
          start_at: string | null
          technician: string | null
          user_id: string
          worked_on: string | null
        }
        Insert: {
          created_at?: string
          end_at?: string | null
          hours?: number
          id?: string
          job_id: string
          labour_item_id: string
          notes?: string | null
          start_at?: string | null
          technician?: string | null
          user_id?: string
          worked_on?: string | null
        }
        Update: {
          created_at?: string
          end_at?: string | null
          hours?: number
          id?: string
          job_id?: string
          labour_item_id?: string
          notes?: string | null
          start_at?: string | null
          technician?: string | null
          user_id?: string
          worked_on?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "labour_time_entries_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "labour_time_entries_labour_item_id_fkey"
            columns: ["labour_item_id"]
            isOneToOne: false
            referencedRelation: "labour_items"
            referencedColumns: ["id"]
          },
        ]
      }
      material_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          sort_order: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          user_id?: string
        }
        Relationships: []
      }
      material_requirements: {
        Row: {
          actual_quantity: number | null
          category_id: string | null
          confidence: string | null
          created_at: string
          description: string
          dimensions: string | null
          finish: string | null
          id: string
          job_id: string
          notes: string | null
          preferred_brand: string | null
          product_id: string | null
          quantity: number
          sort_order: number
          source: string
          status: string
          unit: string
          updated_at: string
          user_id: string
        }
        Insert: {
          actual_quantity?: number | null
          category_id?: string | null
          confidence?: string | null
          created_at?: string
          description?: string
          dimensions?: string | null
          finish?: string | null
          id?: string
          job_id: string
          notes?: string | null
          preferred_brand?: string | null
          product_id?: string | null
          quantity?: number
          sort_order?: number
          source?: string
          status?: string
          unit?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          actual_quantity?: number | null
          category_id?: string | null
          confidence?: string | null
          created_at?: string
          description?: string
          dimensions?: string | null
          finish?: string | null
          id?: string
          job_id?: string
          notes?: string | null
          preferred_brand?: string | null
          product_id?: string | null
          quantity?: number
          sort_order?: number
          source?: string
          status?: string
          unit?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_requirements_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "material_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_requirements_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_requirements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      open_questions: {
        Row: {
          created_at: string
          id: string
          job_id: string
          source: string
          status: string
          text: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          job_id: string
          source?: string
          status?: string
          text?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          job_id?: string
          source?: string
          status?: string
          text?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "open_questions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      product_price_history: {
        Row: {
          created_at: string
          id: string
          invoice_date: string | null
          product_id: string
          purchase_price: number
          supplier_invoice_id: string | null
          supplier_name: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invoice_date?: string | null
          product_id: string
          purchase_price: number
          supplier_invoice_id?: string | null
          supplier_name?: string | null
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          invoice_date?: string | null
          product_id?: string
          purchase_price?: number
          supplier_invoice_id?: string | null
          supplier_name?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_price_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_price_history_supplier_invoice_id_fkey"
            columns: ["supplier_invoice_id"]
            isOneToOne: false
            referencedRelation: "supplier_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          category_id: string | null
          created_at: string
          description: string | null
          id: string
          last_purchase_date: string | null
          manufacturer: string | null
          manufacturer_article_no: string | null
          markup: number | null
          name: string
          notes: string | null
          purchase_price: number | null
          sales_price: number | null
          source: string
          supplier_article_no: string | null
          supplier_name: string | null
          unit: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          last_purchase_date?: string | null
          manufacturer?: string | null
          manufacturer_article_no?: string | null
          markup?: number | null
          name?: string
          notes?: string | null
          purchase_price?: number | null
          sales_price?: number | null
          source?: string
          supplier_article_no?: string | null
          supplier_name?: string | null
          unit?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          active?: boolean
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          last_purchase_date?: string | null
          manufacturer?: string | null
          manufacturer_article_no?: string | null
          markup?: number | null
          name?: string
          notes?: string | null
          purchase_price?: number | null
          sales_price?: number | null
          source?: string
          supplier_article_no?: string | null
          supplier_name?: string | null
          unit?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "material_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
        }
        Relationships: []
      }
      quotations: {
        Row: {
          created_at: string
          id: string
          job_id: string | null
          status: string
          total: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          job_id?: string | null
          status?: string
          total?: number | null
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          job_id?: string | null
          status?: string
          total?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotations_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      selected_products: {
        Row: {
          created_at: string
          id: string
          is_preferred: boolean
          material_id: string | null
          supplier_product_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_preferred?: boolean
          material_id?: string | null
          supplier_product_id?: string | null
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_preferred?: boolean
          material_id?: string | null
          supplier_product_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "selected_products_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "material_requirements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "selected_products_supplier_product_id_fkey"
            columns: ["supplier_product_id"]
            isOneToOne: false
            referencedRelation: "supplier_products"
            referencedColumns: ["id"]
          },
        ]
      }
      service_additional_costs: {
        Row: {
          created_at: string
          description: string
          id: string
          job_id: string
          kind: string
          price: number
          quantity: number
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          job_id: string
          kind?: string
          price?: number
          quantity?: number
          user_id?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          job_id?: string
          kind?: string
          price?: number
          quantity?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_additional_costs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      service_labour_entries: {
        Row: {
          created_at: string
          description: string
          end_at: string | null
          hourly_rate: number
          hours: number
          id: string
          job_id: string
          start_at: string | null
          technician: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string
          end_at?: string | null
          hourly_rate?: number
          hours?: number
          id?: string
          job_id: string
          start_at?: string | null
          technician?: string | null
          user_id?: string
        }
        Update: {
          created_at?: string
          description?: string
          end_at?: string | null
          hourly_rate?: number
          hours?: number
          id?: string
          job_id?: string
          start_at?: string | null
          technician?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_labour_entries_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      service_material_entries: {
        Row: {
          created_at: string
          description: string
          id: string
          job_id: string
          notes: string | null
          purchase_price: number | null
          quantity: number
          sales_price: number
          supplier: string | null
          supplier_article_no: string | null
          unit: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          job_id: string
          notes?: string | null
          purchase_price?: number | null
          quantity?: number
          sales_price?: number
          supplier?: string | null
          supplier_article_no?: string | null
          unit?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          job_id?: string
          notes?: string | null
          purchase_price?: number | null
          quantity?: number
          sales_price?: number
          supplier?: string | null
          supplier_article_no?: string | null
          unit?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_material_entries_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      service_report_counters: {
        Row: {
          last_seq: number
          month: number
          user_id: string
          year: number
        }
        Insert: {
          last_seq?: number
          month: number
          user_id: string
          year: number
        }
        Update: {
          last_seq?: number
          month?: number
          user_id?: string
          year?: number
        }
        Relationships: []
      }
      settings: {
        Row: {
          company_name: string
          currency: string
          default_hourly_rate: number
          default_material_markup: number
          default_technician: string
          estimate_tolerance: number
          service_hourly_rate: number
          small_material_allowance: number
          technician_city: string | null
          technician_email: string | null
          technician_phone: string | null
          technician_role: string
          technician_signature_path: string | null
          technician_street: string | null
          technician_zip: string | null
          travel_rate: number
          updated_at: string
          user_id: string
          vat_rate: number
          vehicle_fee: number
        }
        Insert: {
          company_name?: string
          currency?: string
          default_hourly_rate?: number
          default_material_markup?: number
          default_technician?: string
          estimate_tolerance?: number
          service_hourly_rate?: number
          small_material_allowance?: number
          technician_city?: string | null
          technician_email?: string | null
          technician_phone?: string | null
          technician_role?: string
          technician_signature_path?: string | null
          technician_street?: string | null
          technician_zip?: string | null
          travel_rate?: number
          updated_at?: string
          user_id: string
          vat_rate?: number
          vehicle_fee?: number
        }
        Update: {
          company_name?: string
          currency?: string
          default_hourly_rate?: number
          default_material_markup?: number
          default_technician?: string
          estimate_tolerance?: number
          service_hourly_rate?: number
          small_material_allowance?: number
          technician_city?: string | null
          technician_email?: string | null
          technician_phone?: string | null
          technician_role?: string
          technician_signature_path?: string | null
          technician_street?: string | null
          technician_zip?: string | null
          travel_rate?: number
          updated_at?: string
          user_id?: string
          vat_rate?: number
          vehicle_fee?: number
        }
        Relationships: []
      }
      supplier_invoice_items: {
        Row: {
          confidence: string | null
          created_at: string
          description: string
          discount: number | null
          id: string
          invoice_id: string
          manufacturer: string | null
          manufacturer_article_no: string | null
          match_kind: string | null
          matched_product_id: string | null
          net_total: number | null
          price_decision: string | null
          product_id: string | null
          quantity: number
          review_status: string
          sort_order: number
          supplier_article_no: string | null
          unit: string
          unit_price: number | null
          user_id: string
        }
        Insert: {
          confidence?: string | null
          created_at?: string
          description?: string
          discount?: number | null
          id?: string
          invoice_id: string
          manufacturer?: string | null
          manufacturer_article_no?: string | null
          match_kind?: string | null
          matched_product_id?: string | null
          net_total?: number | null
          price_decision?: string | null
          product_id?: string | null
          quantity?: number
          review_status?: string
          sort_order?: number
          supplier_article_no?: string | null
          unit?: string
          unit_price?: number | null
          user_id?: string
        }
        Update: {
          confidence?: string | null
          created_at?: string
          description?: string
          discount?: number | null
          id?: string
          invoice_id?: string
          manufacturer?: string | null
          manufacturer_article_no?: string | null
          match_kind?: string | null
          matched_product_id?: string | null
          net_total?: number | null
          price_decision?: string | null
          product_id?: string | null
          quantity?: number
          review_status?: string
          sort_order?: number
          supplier_article_no?: string | null
          unit?: string
          unit_price?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "supplier_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_items_matched_product_id_fkey"
            columns: ["matched_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_invoices: {
        Row: {
          created_at: string
          currency: string
          extraction_confidence: string | null
          extraction_status: string
          file_name: string
          file_type: string
          gross_total: number | null
          id: string
          included_in_costs: boolean
          invoice_date: string | null
          invoice_number: string | null
          job_id: string
          net_total: number | null
          notes: string | null
          review_status: string
          storage_path: string
          supplier_name: string | null
          updated_at: string
          user_id: string
          vat_amount: number | null
        }
        Insert: {
          created_at?: string
          currency?: string
          extraction_confidence?: string | null
          extraction_status?: string
          file_name?: string
          file_type?: string
          gross_total?: number | null
          id?: string
          included_in_costs?: boolean
          invoice_date?: string | null
          invoice_number?: string | null
          job_id: string
          net_total?: number | null
          notes?: string | null
          review_status?: string
          storage_path: string
          supplier_name?: string | null
          updated_at?: string
          user_id?: string
          vat_amount?: number | null
        }
        Update: {
          created_at?: string
          currency?: string
          extraction_confidence?: string | null
          extraction_status?: string
          file_name?: string
          file_type?: string
          gross_total?: number | null
          id?: string
          included_in_costs?: boolean
          invoice_date?: string | null
          invoice_number?: string | null
          job_id?: string
          net_total?: number | null
          notes?: string | null
          review_status?: string
          storage_path?: string
          supplier_name?: string | null
          updated_at?: string
          user_id?: string
          vat_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_invoices_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_products: {
        Row: {
          availability: string | null
          category: string | null
          created_at: string
          delivery_date: string | null
          description: string | null
          gross_price: number | null
          id: string
          image_url: string | null
          last_updated: string
          manufacturer: string | null
          manufacturer_article_no: string | null
          name: string | null
          product_url: string | null
          purchase_price: number | null
          stock: number | null
          supplier_article_no: string | null
          supplier_id: string | null
          user_id: string
        }
        Insert: {
          availability?: string | null
          category?: string | null
          created_at?: string
          delivery_date?: string | null
          description?: string | null
          gross_price?: number | null
          id?: string
          image_url?: string | null
          last_updated?: string
          manufacturer?: string | null
          manufacturer_article_no?: string | null
          name?: string | null
          product_url?: string | null
          purchase_price?: number | null
          stock?: number | null
          supplier_article_no?: string | null
          supplier_id?: string | null
          user_id?: string
        }
        Update: {
          availability?: string | null
          category?: string | null
          created_at?: string
          delivery_date?: string | null
          description?: string | null
          gross_price?: number | null
          id?: string
          image_url?: string | null
          last_updated?: string
          manufacturer?: string | null
          manufacturer_article_no?: string | null
          name?: string | null
          product_url?: string | null
          purchase_price?: number | null
          stock?: number | null
          supplier_article_no?: string | null
          supplier_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_sessions: {
        Row: {
          created_at: string
          encrypted_payload: string
          expires_at: string | null
          id: string
          supplier_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          encrypted_payload: string
          expires_at?: string | null
          id?: string
          supplier_key: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          encrypted_payload?: string
          expires_at?: string | null
          id?: string
          supplier_key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          connection_status: string
          created_at: string
          id: string
          name: string
          preferred: boolean
          priority: number
          user_id: string
        }
        Insert: {
          connection_status?: string
          created_at?: string
          id?: string
          name: string
          preferred?: boolean
          priority?: number
          user_id?: string
        }
        Update: {
          connection_status?: string
          created_at?: string
          id?: string
          name?: string
          preferred?: boolean
          priority?: number
          user_id?: string
        }
        Relationships: []
      }
      voice_notes: {
        Row: {
          created_at: string
          duration_seconds: number | null
          id: string
          job_id: string
          kind: string
          storage_path: string | null
          transcript: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_seconds?: number | null
          id?: string
          job_id: string
          kind?: string
          storage_path?: string | null
          transcript?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          duration_seconds?: number | null
          id?: string
          job_id?: string
          kind?: string
          storage_path?: string | null
          transcript?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_notes_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      assign_service_report_number: {
        Args: { p_job_id: string }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
