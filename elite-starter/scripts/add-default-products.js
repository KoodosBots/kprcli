const { createClient } = require('@supabase/supabase-js')

// Load environment variables
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function addDefaultProducts() {
  console.log('📦 Adding default products...')
  
  const defaultProducts = [
    {
      name: 'Basic Package',
      description: 'Basic automation package for simple form submissions',
      token_price: 250,
      category: 'automation',
      is_active: true
    },
    {
      name: 'Standard Package',
      description: 'Standard automation package with enhanced features',
      token_price: 550,
      category: 'automation',
      is_active: true
    },
    {
      name: 'Premium Package',
      description: 'Premium automation package with advanced AI capabilities',
      token_price: 850,
      category: 'automation',
      is_active: true
    },
    {
      name: 'Business Package',
      description: 'Business automation package for enterprise use',
      token_price: 1200,
      category: 'automation',
      is_active: true
    }
  ]
  
  try {
    const { data, error } = await supabase
      .from('products')
      .insert(defaultProducts)
      .select()
    
    if (error) {
      console.error('❌ Error adding products:', error.message)
      return
    }
    
    console.log('✅ Successfully added default products:')
    data.forEach(product => {
      console.log(`   - ${product.name}: $${product.token_price} (${product.category})`)
    })
    
  } catch (error) {
    console.error('❌ Failed to add products:', error.message)
  }
}

addDefaultProducts()