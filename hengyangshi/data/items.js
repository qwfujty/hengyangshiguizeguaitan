/* ============================================================
 * 恒仰市 · 规则怪谈  —  全局道具表
 * 说明：
 *  - shop:true  的道具在补给商店出售，购买后永久拥有；每次入图自动携带，次数重置。
 *  - shop:false 的道具为剧情/证物道具，只能在地图中拾取或由结局授予（可跨图）。
 *  - effect 只在 HUD「道具」面板主动使用时结算。
 *  - decay：使用达到 after 次后触发变异 flag 与提示文本。
 * ============================================================ */
(function () {
  "use strict";

  HY.registerItems({

    /* ---------------------------- 回复类 ---------------------------- */
    it_water: {
      name: "保温杯 · 凉白开",
      category: "回复",
      shop: true,
      price: 10,
      uses: 3,
      effect: { sanity: 10, infection: -2 },
      desc: "妈妈烧开又放凉的水。恒仰市的自来水不能直接喝，不能直视，但烧开之后可以——这是居家守则里唯一一条没有后半句的规则。"
    },
    it_tea: {
      name: "保温壶里的茶",
      category: "回复",
      shop: true,
      price: 8,
      uses: 2,
      effect: { sanity: 8 },
      desc: "茶叶沉在壶底，像很小的人。喝下去的时候，你舌尖的异物感会退后一点。"
    },
    it_candy: {
      name: "蓝色包装润喉糖",
      category: "回复",
      shop: true,
      price: 14,
      uses: 2,
      effect: { sanity: 20, infection: 4 },
      desc: "蓝色或透明包装的纪念品被认为是安全的。甜味会让你短暂忘记舌根下的硬块——代价写在成分表背面，用极小的字。"
    },
    it_calm: {
      name: "校医室镇静剂",
      category: "稳定",
      shop: true,
      price: 22,
      uses: 1,
      effect: { sanity: 32, infection: -4, stamina: -4 },
      desc: "透明液体。校医说这是“认知放松调节”，打完之后手会抖一阵，看视力表会清楚很多。"
    },

    /* ---------------------------- 稳定类 ---------------------------- */
    it_ash: {
      name: "香灰符",
      category: "稳定",
      shop: true,
      price: 18,
      uses: 2,
      effect: { infection: -14, sanity: 5 },
      desc: "白果村摊位上的朱锦小袋，一元一袋，本地人远行必带。缝进贴身衣里可挡一次“气”；但若你每日接触青露，符便再无作用。"
    },
    it_smoke: {
      name: "香灰",
      category: "稳定",
      shop: true,
      price: 12,
      uses: 2,
      effect: { infection: -5 },
      desc: "抓一小撮洒在门槛内侧，念三遍“童言无忌，百无禁忌”。年里的规矩犯了，全靠它补救。"
    },
    it_wipe: {
      name: "特制清洁湿巾",
      category: "稳定",
      shop: true,
      price: 12,
      uses: 3,
      effect: { infection: -8 },
      desc: "机场特产店柜台下常年备着的湿巾，用来擦拭顾客碰过的台面。也可以擦手——在镜子里看见自己手指数量不对之前。"
    },
    it_charger: {
      name: "蓝色五角星充电宝",
      category: "稳定",
      shop: true,
      price: 30,
      uses: 2,
      effect: { sanity: 12, infection: -3 },
      decay: { after: 2, flag: "f_charger_red", text: "充电宝的外壳在掌心发烫。五角星的一角变成了暗红色，像被谁用指甲抠过。" },
      desc: "机场官方配色为蓝、红、绿。蓝色是基础的安全色——仅限于前两次。员工守则说：电量充足时自行变红，请立即上交。"
    },
    it_band: {
      name: "创可贴与纱布",
      category: "护身",
      shop: true,
      price: 6,
      uses: 2,
      effect: { infection: -3, sanity: 3 },
      desc: "遮住身体上不该出现的伤口。在恒仰市，有些伤口是“被看见”之后才开始真的疼。"
    },

    /* ---------------------------- 护身类 ---------------------------- */
    it_lantern: {
      name: "白纸灯笼",
      category: "护身",
      shop: true,
      price: 26,
      uses: 1,
      effect: { sanity: 18, infection: -6 },
      desc: "李婆婆塞给你的白纸灯笼。挂上它，“至少来世不必再做白果村的人”。也有人说，它能照亮一次本不该看见的路。"
    },
    it_cloth: {
      name: "黑棉布",
      category: "护身",
      shop: true,
      price: 16,
      uses: 1,
      effect: { sanity: 8 },
      desc: "把不该亮的灯罩起来。记住两条：绝不允许任何一个房间陷入完全的黑暗，也绝不允许任何一盏灯亮到天明。"
    },
    it_rope: {
      name: "红绳",
      category: "事件",
      shop: true,
      price: 15,
      uses: 1,
      effect: { sanity: 6 },
      desc: "两人同行时把手腕系在一起，确保物理连接。松手的那一刻，规则就断了。"
    },

    /* ---------------------------- 事件类 ---------------------------- */
    it_phone: {
      name: "旧手机",
      category: "事件",
      shop: true,
      price: 25,
      uses: 1,
      effect: { sanity: 6 },
      desc: "只能接听特定号码、收发特定短信的旧手机。爸爸说最近外面不太平，就给了你这个。也许还能拨出一个。"
    },
    it_torch: {
      name: "手电筒",
      category: "事件",
      shop: true,
      price: 12,
      uses: 2,
      effect: { sanity: 5 },
      desc: "光柱里的灰尘动得很慢。夜里的山和楼，都不喜欢黑；但有些东西，只在光里才会被看见。"
    },
    it_lighter: {
      name: "打火机",
      category: "事件",
      shop: true,
      price: 14,
      uses: 2,
      effect: {},
      desc: "只有火能真正擦除紫色的问号，也能烧掉太多别的东西——牌位、纸钱、信封、一整个家。"
    },
    it_mirror: {
      name: "小圆镜",
      category: "事件",
      shop: true,
      price: 8,
      uses: 2,
      effect: { sanity: -4, infection: 2 },
      desc: "镜面只能用于整理仪容。如果影像的动作慢了两秒，或者露出了你没有做过的表情……你还来得及放下它。"
    },
    it_compass: {
      name: "指北针",
      category: "事件",
      shop: true,
      price: 18,
      uses: 1,
      effect: { sanity: 6 },
      desc: "指针指向的不是北，是一座更亮的城市。至少在雾里能确认一件事：你还在移动。"
    },
    it_fishrod: {
      name: "小鱼竿",
      category: "事件",
      shop: true,
      price: 18,
      uses: 1,
      effect: {},
      desc: "上山必须携带一只小鱼竿，请不要用小鱼竿钓鱼。可它偏偏是唯一能把红果送进水里的东西。"
    },
    it_map: {
      name: "恒仰市手绘地图",
      category: "事件",
      shop: true,
      price: 20,
      uses: 1,
      effect: { sanity: 8 },
      desc: "图上没有机场，也没有白果村。制图人用铅笔补了两笔，笔迹很轻，像怕被谁看见。"
    },
    it_notebook: {
      name: "空白笔记本",
      category: "事件",
      shop: true,
      price: 15,
      uses: 2,
      effect: { sanity: 10 },
      desc: "记录会拯救记忆，也会吸引注意。写下名字的时候，笔尖会自己停顿一下。"
    },
    it_sticker: {
      name: "黄色腕带",
      category: "事件",
      shop: true,
      price: 10,
      uses: 1,
      effect: { sanity: 4 },
      desc: "健康申报处发的腕带。戴上它，你就不用排队了——队伍的另一头是什么，没人告诉你。"
    },
    it_stamp: {
      name: "做旧的工作证",
      category: "事件",
      shop: true,
      price: 24,
      uses: 1,
      effect: {},
      desc: "照片上的人和你很像。制服的颜色差一点，肩章的碎带也差一点。足够骗过一只眼睛，不够骗过两面镜子。"
    },
    it_ink: {
      name: "蓝色墨水",
      category: "事件",
      shop: true,
      price: 20,
      uses: 2,
      effect: { sanity: 5 },
      desc: "校医开“认知建议条”时唯一有效的墨水。被写下的名字，会被当作还活着。"
    },
    it_redbag: {
      name: "红塑料袋",
      category: "事件",
      shop: true,
      price: 10,
      uses: 1,
      effect: {},
      desc: "装不认识的东西：陌生的鞋、褪色的儿童玩具、未曾见过的合影。日落前带到最近的十字路口烧掉——注意，面朝西方，不要回头。"
    },
    it_hints: {
      name: "守则批注本",
      category: "事件",
      shop: true,
      price: 100,
      uses: 1,
      effect: { sanity: 6 },
      desc:
        "一本被人用红笔写满批注的守则合订本。批注者显然活了下来——他给每一条选择都标了“安全 / 危险 / 代价 / 道具”。" +
        "购买后，游戏中的选项才会显示性质标签与小字提示；没有它，你只能凭直觉选。"
    },

    /* ============================================================
     * 剧情 / 证物道具（商店不出售）
     * ============================================================ */
    it_note_mom: {
      name: "妈妈的便条",
      category: "剧情",
      shop: false,
      uses: 1,
      effect: { sanity: 6 },
      desc: "写在信纸上的七条家规，字迹是妈妈的。最后一行被水洇开了：别怕，妈妈在。"
    },
    it_ticket_g1564: {
      name: "G1564 次车票",
      category: "剧情",
      shop: false,
      uses: 1,
      effect: { sanity: 4 },
      desc: "一张皱巴巴的车票，不知道什么时候就躺在你的口袋里。票面上的车次印得很深，像被谁用指甲反复描过。"
    },
    it_photo_family: {
      name: "褪色的全家福",
      category: "剧情",
      shop: false,
      uses: 1,
      effect: { sanity: 6 },
      desc: "照片里有三个人。爸爸的脸被反复摩挲得发白，妈妈的笑容比你记忆里年轻。你的位置空着。"
    },
    it_badge_tsp: {
      name: "特警的编号牌",
      category: "证物",
      shop: false,
      uses: 1,
      effect: { sanity: 8 },
      desc: "黑作战服特警塞给你的一块金属牌，编号被磨损得只剩“幸存者”三个字。他说：拿着，下一趟车上有人会问。"
    },
    it_ticket_half: {
      name: "G1564 次车票副券",
      category: "证物",
      shop: false,
      uses: 1,
      effect: { sanity: 8 },
      desc: "列车长撕下的副券，票根背面用铅笔写着一行小字：本车永不晚点。所以，晚点的不是车。"
    },
    it_pass_outside: {
      name: "不属于恒仰市的登机牌",
      category: "证物",
      shop: false,
      uses: 1,
      effect: { sanity: 10 },
      desc: "登机牌上的城市名你从未听说过，但日期是明天。纸张的触感、油墨的气味，都来自“外面”。"
    },
    it_stabilizer: {
      name: "几何稳定仪残片",
      category: "证物",
      shop: false,
      uses: 1,
      effect: { infection: -10, sanity: 8 },
      desc: "一块掌心大的黑色石板碎片，刻着不断细微变化的几何纹路。握着它，你会暂时相信“形状只是形状，数字只是数字”。"
    },
    it_raft_cord: {
      name: "槐木筏索",
      category: "证物",
      shop: false,
      uses: 1,
      effect: { sanity: 10 },
      desc: "不是麻，也不是藤。是阿音的头发编成的绳，摸上去还是温的。它记得河对岸的方向。"
    },
    it_chisel: {
      name: "阿音的凿子",
      category: "证物",
      shop: false,
      uses: 1,
      effect: { sanity: 8, stamina: -2 },
      desc: "凿了一辈子石壁的凿子，柄上全是磨烂又结痂的手印。阿音说：路是凿开的，不是用人填平的。"
    },
    it_redfruit: {
      name: "封存的红果",
      category: "证物",
      shop: false,
      uses: 1,
      effect: { infection: 6, sanity: -6 },
      desc: "玻璃罐里那颗红果，仔细看是蜷缩的、很小的人形。它偶尔会在你背包里轻轻翻身。"
    },
    it_geology: {
      name: "恒仰市地区地质水文考",
      category: "证物",
      shop: false,
      uses: 1,
      effect: { sanity: 12, infection: 4 },
      desc: "1983 年内部资料，第 27 页有一行没涂干净的字：患者会发展出象征性器官，逃避……书页边缘的蓝墨水写着：湖是镜子。"
    },
    it_diary_zhou: {
      name: "周宇的日记",
      category: "证物",
      shop: false,
      uses: 1,
      effect: { sanity: 6, infection: -2 },
      desc: "封面上写着日记。最后一页被撕掉，只剩半行：我也想找——翅膀不是长出来的，是换上去的。"
    },
    it_black_envelope: {
      name: "黑色的压岁钱",
      category: "证物",
      shop: false,
      uses: 1,
      effect: { sanity: 10 },
      desc: "直系长辈给的黑风弹，压在枕头下直到正月结束。拆开之后，里面是一小片金色的、像玻璃一样的东西。"
    },
    it_program: {
      name: "被涂改的节目单",
      category: "证物",
      shop: false,
      uses: 1,
      effect: { sanity: 8 },
      desc: "恒仰市春节联欢晚会节目单。压轴节目《倒计时》后面，有人用蓝墨水添了一行：七七先生没有回来。"
    }
  });
})();
