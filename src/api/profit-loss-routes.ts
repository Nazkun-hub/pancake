import { Router } from 'express';
import { 插件管理器 } from '../plugins/PluginManager.js';

const router = Router();

/**
 * 📊 获取所有实例的盈亏统计
 * GET /api/profit-loss/all
 */
router.get('/all', (req, res) => {
  try {
    const 盈亏插件 = 插件管理器.获取盈亏插件();
    
    if (!盈亏插件) {
      return res.status(500).json({
        success: false,
        error: '盈亏统计插件未启动'
      });
    }

    const 所有统计 = 盈亏插件.获取所有统计();
    
    return res.json({
      success: true,
      data: 所有统计,
      统计汇总: {
        总实例数: 所有统计.length,
        运行中: 所有统计.filter(d => d.状态 === '运行中').length,
        已完成: 所有统计.filter(d => d.状态 === '已完成').length,
        已退出: 所有统计.filter(d => d.状态 === '已退出').length
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '获取盈亏统计失败'
    });
  }
});

/**
 * 📈 获取单个实例的盈亏统计
 * GET /api/profit-loss/instance/:instanceId
 */
router.get('/instance/:instanceId', (req, res) => {
  try {
    const { instanceId } = req.params;
    const 盈亏插件 = 插件管理器.获取盈亏插件();
    
    if (!盈亏插件) {
      return res.status(500).json({
        success: false,
        error: '盈亏统计插件未启动'
      });
    }

    const 实例统计 = 盈亏插件.获取实例统计(instanceId);
    
    if (!实例统计) {
      return res.status(404).json({
        success: false,
        error: `实例 ${instanceId} 的统计数据不存在`
      });
    }

    return res.json({
      success: true,
      data: 实例统计
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '获取实例统计失败'
    });
  }
});

/**
 * 🔄 获取实例生命周期报告
 * GET /api/profit-loss/lifecycle/:instanceId
 */
router.get('/lifecycle/:instanceId', (req, res) => {
  try {
    const { instanceId } = req.params;
    const 盈亏插件 = 插件管理器.获取盈亏插件();
    
    if (!盈亏插件) {
      return res.status(500).json({
        success: false,
        error: '盈亏统计插件未启动'
      });
    }

    const 生命周期报告 = 盈亏插件.获取生命周期报告(instanceId);
    
    if (!生命周期报告) {
      return res.status(404).json({
        success: false,
        error: `实例 ${instanceId} 的生命周期报告不存在`
      });
    }

    return res.json({
      success: true,
      data: 生命周期报告
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '获取生命周期报告失败'
    });
  }
});

/**
 * 📊 获取所有实例生命周期汇总
 * GET /api/profit-loss/lifecycle-summary
 */
router.get('/lifecycle-summary', (req, res) => {
  try {
    const 盈亏插件 = 插件管理器.获取盈亏插件();
    
    if (!盈亏插件) {
      return res.status(500).json({
        success: false,
        error: '盈亏统计插件未启动'
      });
    }

    const 生命周期汇总 = 盈亏插件.获取所有生命周期汇总();
    
    return res.json({
      success: true,
      data: 生命周期汇总
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '获取生命周期汇总失败'
    });
  }
});

/**
 * 📈 获取盈亏汇总统计
 * GET /api/profit-loss/summary
 */
router.get('/summary', (req, res) => {
  try {
    const 盈亏插件 = 插件管理器.获取盈亏插件();
    
    if (!盈亏插件) {
      return res.status(500).json({
        success: false,
        error: '盈亏统计插件未启动'
      });
    }

    const 所有统计 = 盈亏插件.获取所有统计();
    
    // 计算汇总数据
    const 汇总统计 = {
      总投入_usdt: 0,
      总当前价值_usdt: 0,
      总绝对盈亏_usdt: 0,
      总净盈亏_usdt: 0,
      平均投资回报率_percent: 0,
      盈利实例数: 0,
      亏损实例数: 0
    };
    
    所有统计.forEach(data => {
      汇总统计.总投入_usdt += data.初始投入.总价值_usdt;
      汇总统计.总当前价值_usdt += data.当前资产.总价值_usdt;
      汇总统计.总绝对盈亏_usdt += data.盈亏统计.绝对盈亏_usdt;
      汇总统计.总净盈亏_usdt += data.盈亏统计.净盈亏_usdt;
      
      // 统计盈利和亏损实例数
      if (data.盈亏统计.净盈亏_usdt > 0) {
        汇总统计.盈利实例数++;
      } else if (data.盈亏统计.净盈亏_usdt < 0) {
        汇总统计.亏损实例数++;
      }
    });
    
    // 计算平均投资回报率
    if (所有统计.length > 0 && 汇总统计.总投入_usdt > 0) {
      汇总统计.平均投资回报率_percent = (汇总统计.总净盈亏_usdt / 汇总统计.总投入_usdt) * 100;
    }

    return res.json({
      success: true,
      data: {
        汇总统计,
        实例数量: {
          总数: 所有统计.length,
          运行中: 所有统计.filter(d => d.状态 === '运行中').length,
          已完成: 所有统计.filter(d => d.状态 === '已完成').length,
          已退出: 所有统计.filter(d => d.状态 === '已退出').length,
          盈利: 汇总统计.盈利实例数,
          亏损: 汇总统计.亏损实例数
        }
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '获取汇总统计失败'
    });
  }
});

/**
 * 🔍 获取基础货币标准的盈亏统计
 * GET /api/profit-loss/base-currency-stats
 */
router.get('/base-currency-stats', async (req, res): Promise<void> => {
  try {
    const { 插件管理器 } = await import('../plugins/PluginManager');
    const 盈亏插件 = 插件管理器.获取盈亏插件();
    
    if (!盈亏插件) {
      res.status(503).json({
        success: false,
        error: '盈亏插件未启用'
      });
      return;
    }

    const 所有数据 = 盈亏插件.获取所有统计();
    
    // 🔧 处理基础货币标准的统计
    const 基础货币统计 = 所有数据.map(数据 => ({
      实例ID: 数据.实例ID,
      策略名称: 数据.策略名称,
      状态: 数据.状态,
      开始时间: 数据.开始时间,
      结束时间: 数据.结束时间,
      
      // 基础货币信息
      基础货币信息: 数据.基础货币信息,
      计算场景: 数据.计算场景,
      
      // 场景分成本分析
      成本分析: {
        场景1_成本: 数据.初始投入.场景1_成本,
        场景2_成本: 数据.初始投入.场景2_成本
      },
      
      // 基础货币标准盈亏
      基础货币盈亏: 数据.盈亏统计.基础货币盈亏,
      
      // 交换历史中的基础货币信息
      基础货币交换: 数据.交换历史.filter(交换 => 交换.是否涉及基础货币).map(交换 => ({
        时间: 交换.时间,
        类型: 交换.类型,
        from_token: 交换.from_token,
        to_token: 交换.to_token,
        基础货币方向: 交换.基础货币方向,
        基础货币数量: 交换.基础货币数量,
        交易哈希: 交换.交易哈希
      }))
    }));

    res.json({
      success: true,
      data: {
        总实例数: 基础货币统计.length,
        运行中实例数: 基础货币统计.filter(s => s.状态 === '运行中').length,
        已完成实例数: 基础货币统计.filter(s => s.状态 === '已完成').length,
        统计详情: 基础货币统计
      }
    });

  } catch (error) {
    console.error('❌ 获取基础货币统计失败:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '服务器内部错误'
    });
  }
});

/**
 * 🔍 获取特定实例的基础货币详细分析
 * GET /api/profit-loss/base-currency-analysis/:instanceId
 */
router.get('/base-currency-analysis/:instanceId', async (req, res): Promise<void> => {
  try {
    const { instanceId } = req.params;
    const { 插件管理器 } = await import('../plugins/PluginManager');
    const 盈亏插件 = 插件管理器.获取盈亏插件();
    
    if (!盈亏插件) {
      res.status(503).json({
        success: false,
        error: '盈亏插件未启用'
      });
      return;
    }

    const 实例数据 = 盈亏插件.获取实例统计(instanceId);
    
    if (!实例数据) {
      res.status(404).json({
        success: false,
        error: `实例 ${instanceId} 不存在`
      });
      return;
    }

    // 🔧 详细的基础货币分析
    const 详细分析 = {
      基本信息: {
        实例ID: 实例数据.实例ID,
        策略名称: 实例数据.策略名称,
        状态: 实例数据.状态,
        开始时间: 实例数据.开始时间,
        结束时间: 实例数据.结束时间,
        持续时间_小时: 实例数据.结束时间 ? 
          (实例数据.结束时间 - 实例数据.开始时间) / (1000 * 60 * 60) : 
          (Date.now() - 实例数据.开始时间) / (1000 * 60 * 60)
      },
      
      基础货币信息: 实例数据.基础货币信息,
      计算场景: 实例数据.计算场景,
      
      // 🔧 场景详细分析
      场景分析: 实例数据.计算场景 === '场景1_双非基础货币' ? {
        场景类型: '场景1：双非基础货币',
        描述: '两个代币都需要用基础货币购买',
        成本构成: {
          token0购买成本: `${实例数据.初始投入.场景1_成本.token0购买成本_基础货币} ${实例数据.基础货币信息.当前基础货币}`,
          token1购买成本: `${实例数据.初始投入.场景1_成本.token1购买成本_基础货币} ${实例数据.基础货币信息.当前基础货币}`,
          总购买成本: `${实例数据.初始投入.场景1_成本.总购买成本_基础货币} ${实例数据.基础货币信息.当前基础货币}`
        }
      } : {
        场景类型: '场景2：包含基础货币',
        描述: '其中一个代币是基础货币',
        成本构成: {
          非基础货币购买成本: `${实例数据.初始投入.场景2_成本.非基础货币购买成本_基础货币} ${实例数据.基础货币信息.当前基础货币}`,
          直接投入基础货币: `${实例数据.初始投入.场景2_成本.直接投入基础货币数量} ${实例数据.基础货币信息.当前基础货币}`,
          总成本: `${实例数据.初始投入.场景2_成本.总成本_基础货币} ${实例数据.基础货币信息.当前基础货币}`
        }
      },
      
      // 基础货币盈亏详情
      盈亏详情: {
        ...实例数据.盈亏统计.基础货币盈亏,
        基础货币单位: 实例数据.基础货币信息.当前基础货币
      },
      
      // 交换历史分析
      交换分析: {
        总交换次数: 实例数据.交换历史.length,
        涉及基础货币交换次数: 实例数据.交换历史.filter(t => t.是否涉及基础货币).length,
        基础货币交换详情: 实例数据.交换历史.filter(t => t.是否涉及基础货币).map(交换 => ({
          时间: new Date(交换.时间).toLocaleString(),
          方向: 交换.基础货币方向,
          数量: `${交换.基础货币数量} ${实例数据.基础货币信息.当前基础货币}`,
          交易对: `${交换.from_token} → ${交换.to_token}`,
          交易哈希: 交换.交易哈希
        }))
      }
    };

    res.json({
      success: true,
      data: 详细分析
    });

  } catch (error) {
    console.error('❌ 获取基础货币分析失败:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '服务器内部错误'
    });
  }
});

/**
 * 🔧 手动触发成本重新计算
 * POST /api/profit-loss/recalculate-costs
 */
router.post('/recalculate-costs', async (req, res): Promise<void> => {
  try {
    const { 插件管理器 } = await import('../plugins/PluginManager');
    const 盈亏插件 = 插件管理器.获取盈亏插件();
    
    if (!盈亏插件) {
      res.status(503).json({
        success: false,
        error: '盈亏插件未启用'
      });
      return;
    }

    // 调用手动重新计算方法
    await (盈亏插件 as any).手动重新计算成本();
    
    res.json({
      success: true,
      message: '成本重新计算已完成'
    });

  } catch (error) {
    console.error('❌ 手动成本重新计算失败:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '服务器内部错误'
    });
  }
});

/**
 * 🔧 修复重复交易记录问题
 * POST /api/profit-loss/fix-duplicate-transactions
 */
router.post('/fix-duplicate-transactions', async (req, res): Promise<void> => {
  try {
    const { 插件管理器 } = await import('../plugins/PluginManager');
    const 盈亏插件 = 插件管理器.获取盈亏插件();
    
    if (!盈亏插件) {
      res.status(503).json({
        success: false,
        error: '盈亏插件未启用'
      });
      return;
    }

    // 调用修复重复交易记录方法
    (盈亏插件 as any).修复重复交易记录();
    
    res.json({
      success: true,
      message: '重复交易记录修复已完成'
    });

  } catch (error) {
    console.error('❌ 修复重复交易记录失败:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '服务器内部错误'
    });
  }
});

/**
 * 🗑️ 删除指定实例的统计数据
 * DELETE /api/profit-loss/instance/:instanceId
 */
router.delete('/instance/:instanceId', (req, res) => {
  try {
    const { instanceId } = req.params;
    const 盈亏插件 = 插件管理器.获取盈亏插件();
    
    if (!盈亏插件) {
      return res.status(500).json({
        success: false,
        error: '盈亏统计插件未启动'
      });
    }

    // 检查实例是否存在
    const 实例统计 = 盈亏插件.获取实例统计(instanceId);
    if (!实例统计) {
      return res.status(404).json({
        success: false,
        error: `实例 ${instanceId} 的统计数据不存在`
      });
    }

    // 删除实例统计
    const 删除结果 = 盈亏插件.删除实例统计(instanceId);
    
    if (删除结果) {
      console.log(`[API] 实例 ${instanceId} 的统计数据已删除`);
      return res.json({
        success: true,
        message: `实例 ${instanceId} 的统计数据已成功删除`
      });
    } else {
      return res.status(500).json({
        success: false,
        error: '删除实例统计失败'
      });
    }
  } catch (error) {
    console.error(`[API] 删除实例 ${req.params.instanceId} 统计失败:`, error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '删除实例统计失败'
    });
  }
});

export default router; 