/* ═══════════════════════════════════════════════════════════════
   services.js — Service pages: content data + rendering
   ═══════════════════════════════════════════════════════════════ */

'use strict';

/* ─── Service content definitions ─── */
const SERVICES = {
  'financial-advisory': {
    highlights: [
      { icon: 'fa-users', color: '#5b21b6', bg: '#ede9fe', value: '120+',    label: 'Clients Advised'     },
      { icon: 'fa-award', color: '#5b21b6', bg: '#ede9fe', value: '15 Yrs',  label: 'Industry Experience' },
      { icon: 'fa-star',  color: '#5b21b6', bg: '#ede9fe', value: '98%',     label: 'Satisfaction Rate'   },
      { icon: 'fa-globe', color: '#5b21b6', bg: '#ede9fe', value: '8+',      label: 'Countries Served'    }
    ],
    features: [
      { icon: 'fa-check-circle', color: '#5b21b6', text: 'Personal & corporate financial planning and budgeting'        },
      { icon: 'fa-check-circle', color: '#5b21b6', text: 'Investment portfolio management and asset allocation advice'   },
      { icon: 'fa-check-circle', color: '#5b21b6', text: 'Loan structuring, debt management and refinancing support'    },
      { icon: 'fa-check-circle', color: '#5b21b6', text: 'Cash flow forecasting and liquidity planning'                 },
      { icon: 'fa-check-circle', color: '#5b21b6', text: 'Risk assessment and mitigation strategies'                    },
      { icon: 'fa-check-circle', color: '#5b21b6', text: 'Tax planning and compliance advisory'                         },
      { icon: 'fa-check-circle', color: '#5b21b6', text: 'Retirement and wealth-building strategies'                    },
      { icon: 'fa-check-circle', color: '#5b21b6', text: 'Financial due diligence for mergers & acquisitions'           }
    ],
    audience: [
      { icon: 'fa-user',     color: '#5b21b6', bg: '#ede9fe', label: 'Individual Investors & Professionals' },
      { icon: 'fa-building', color: '#5b21b6', bg: '#ede9fe', label: 'SMEs & Growing Corporations'          },
      { icon: 'fa-university', color: '#5b21b6', bg: '#ede9fe', label: 'NGOs & Non-Profit Organizations'   },
      { icon: 'fa-hand-holding-usd', color: '#5b21b6', bg: '#ede9fe', label: 'Start-ups Seeking Funding'  }
    ]
  },

  'research-consulting': {
    highlights: [
      { icon: 'fa-file-alt',   color: '#1e40af', bg: '#dbeafe', value: '250+', label: 'Research Reports'    },
      { icon: 'fa-briefcase',  color: '#1e40af', bg: '#dbeafe', value: '80+',  label: 'Consulting Projects' },
      { icon: 'fa-clock',      color: '#1e40af', bg: '#dbeafe', value: '72h',  label: 'Avg. Turnaround'     },
      { icon: 'fa-handshake',  color: '#1e40af', bg: '#dbeafe', value: '40+',  label: 'Partner Networks'    }
    ],
    features: [
      { icon: 'fa-check-circle', color: '#1e40af', text: 'Market research and competitive landscape analysis'                },
      { icon: 'fa-check-circle', color: '#1e40af', text: 'Feasibility studies for new projects and business ventures'        },
      { icon: 'fa-check-circle', color: '#1e40af', text: 'Industry and sector-specific economic research'                    },
      { icon: 'fa-check-circle', color: '#1e40af', text: 'Policy research and regulatory impact assessments'                 },
      { icon: 'fa-check-circle', color: '#1e40af', text: 'Customer and stakeholder surveys with analytical reporting'        },
      { icon: 'fa-check-circle', color: '#1e40af', text: 'Strategic roadmap and business model consulting'                   },
      { icon: 'fa-check-circle', color: '#1e40af', text: 'Grant writing and proposal development support'                    },
      { icon: 'fa-check-circle', color: '#1e40af', text: 'Data visualization and executive presentation decks'               }
    ],
    audience: [
      { icon: 'fa-building',   color: '#1e40af', bg: '#dbeafe', label: 'Government Ministries & Agencies'    },
      { icon: 'fa-university', color: '#1e40af', bg: '#dbeafe', label: 'Academic and Research Institutions'  },
      { icon: 'fa-globe',      color: '#1e40af', bg: '#dbeafe', label: 'International Development Partners'  },
      { icon: 'fa-briefcase',  color: '#1e40af', bg: '#dbeafe', label: 'Private Sector Enterprises'          }
    ]
  },

  'access-management': {
    highlights: [
      { icon: 'fa-shield-alt', color: '#065f46', bg: '#d1fae5', value: '500+', label: 'Users Managed'          },
      { icon: 'fa-lock',       color: '#065f46', bg: '#d1fae5', value: '99.9%', label: 'Uptime Guarantee'      },
      { icon: 'fa-eye-slash',  color: '#065f46', bg: '#d1fae5', value: '0',    label: 'Breaches Recorded'      },
      { icon: 'fa-cogs',       color: '#065f46', bg: '#d1fae5', value: '30+',  label: 'Integrations Supported' }
    ],
    features: [
      { icon: 'fa-check-circle', color: '#065f46', text: 'Role-based access control (RBAC) design and implementation'      },
      { icon: 'fa-check-circle', color: '#065f46', text: 'Identity and access management (IAM) system setup'               },
      { icon: 'fa-check-circle', color: '#065f46', text: 'Multi-factor authentication (MFA) configuration'                 },
      { icon: 'fa-check-circle', color: '#065f46', text: 'User provisioning, onboarding and offboarding workflows'         },
      { icon: 'fa-check-circle', color: '#065f46', text: 'Audit trail logging and compliance reporting'                    },
      { icon: 'fa-check-circle', color: '#065f46', text: 'Single Sign-On (SSO) integration across platforms'               },
      { icon: 'fa-check-circle', color: '#065f46', text: 'Privileged access management for sensitive systems'              },
      { icon: 'fa-check-circle', color: '#065f46', text: 'Security policy drafting and staff awareness training'           }
    ],
    audience: [
      { icon: 'fa-hospital',     color: '#065f46', bg: '#d1fae5', label: 'Healthcare & Finance Organizations'   },
      { icon: 'fa-university',   color: '#065f46', bg: '#d1fae5', label: 'Government & Public Sector Bodies'    },
      { icon: 'fa-building',     color: '#065f46', bg: '#d1fae5', label: 'Corporations with Remote Workforces'  },
      { icon: 'fa-user-graduate',color: '#065f46', bg: '#d1fae5', label: 'Educational Institutions'             }
    ]
  },

  'business-development': {
    highlights: [
      { icon: 'fa-chart-line',   color: '#92400e', bg: '#fef3c7', value: '60+',  label: 'Growth Projects'        },
      { icon: 'fa-handshake',    color: '#92400e', bg: '#fef3c7', value: '35+',  label: 'Partnerships Forged'    },
      { icon: 'fa-dollar-sign',  color: '#92400e', bg: '#fef3c7', value: '$5M+', label: 'Revenue Generated'      },
      { icon: 'fa-map-marked-alt',color: '#92400e', bg: '#fef3c7', value: '12+', label: 'Markets Entered'        }
    ],
    features: [
      { icon: 'fa-check-circle', color: '#92400e', text: 'Business growth strategy development and execution planning'       },
      { icon: 'fa-check-circle', color: '#92400e', text: 'Market entry analysis, segmentation and go-to-market strategies'  },
      { icon: 'fa-check-circle', color: '#92400e', text: 'Partnership identification, negotiation and relationship building' },
      { icon: 'fa-check-circle', color: '#92400e', text: 'Product and service portfolio expansion advisory'                  },
      { icon: 'fa-check-circle', color: '#92400e', text: 'Investor relations and pitch deck preparation support'             },
      { icon: 'fa-check-circle', color: '#92400e', text: 'Revenue diversification and new income stream identification'      },
      { icon: 'fa-check-circle', color: '#92400e', text: 'Sales process optimization and lead generation frameworks'        },
      { icon: 'fa-check-circle', color: '#92400e', text: 'Brand positioning and competitive differentiation consulting'      }
    ],
    audience: [
      { icon: 'fa-seedling',   color: '#92400e', bg: '#fef3c7', label: 'Start-ups & Early-Stage Ventures'      },
      { icon: 'fa-store',      color: '#92400e', bg: '#fef3c7', label: 'SMEs Seeking Expansion'                 },
      { icon: 'fa-globe-africa',color: '#92400e', bg: '#fef3c7', label: 'Organizations Entering New Markets'    },
      { icon: 'fa-users-cog',  color: '#92400e', bg: '#fef3c7', label: 'Executives & Leadership Teams'         }
    ]
  },

  'vehicle-hire': {
    highlights: [
      { icon: 'fa-car',          color: '#991b1b', bg: '#fee2e2', value: '20+',   label: 'Vehicles in Fleet'    },
      { icon: 'fa-print',        color: '#991b1b', bg: '#fee2e2', value: '1000+', label: 'Print Jobs Completed' },
      { icon: 'fa-clock',        color: '#991b1b', bg: '#fee2e2', value: '24/7',  label: 'Vehicle Availability' },
      { icon: 'fa-star',         color: '#991b1b', bg: '#fee2e2', value: '4.9★',  label: 'Client Rating'        }
    ],
    features: [
      { icon: 'fa-check-circle', color: '#991b1b', text: 'Short-term and long-term vehicle hire for corporate use'           },
      { icon: 'fa-check-circle', color: '#991b1b', text: 'Chauffeur-driven executive and airport transfer services'          },
      { icon: 'fa-check-circle', color: '#991b1b', text: 'Event, conference and delegation fleet management'                 },
      { icon: 'fa-check-circle', color: '#991b1b', text: 'Full-color brochure, flyer and booklet printing'                   },
      { icon: 'fa-check-circle', color: '#991b1b', text: 'Corporate branded stationery, banners and roll-ups'               },
      { icon: 'fa-check-circle', color: '#991b1b', text: 'Vehicle branding, wraps and fleet livery printing'                 },
      { icon: 'fa-check-circle', color: '#991b1b', text: 'Large-format outdoor billboard and signage printing'               },
      { icon: 'fa-check-circle', color: '#991b1b', text: 'Express same-day printing services for urgent orders'             }
    ],
    audience: [
      { icon: 'fa-building',    color: '#991b1b', bg: '#fee2e2', label: 'Corporations & Corporate Events'       },
      { icon: 'fa-user-tie',    color: '#991b1b', bg: '#fee2e2', label: 'Executives & Diplomatic Delegations'   },
      { icon: 'fa-users',       color: '#991b1b', bg: '#fee2e2', label: 'NGOs, Conferences & Workshops'         },
      { icon: 'fa-store',       color: '#991b1b', bg: '#fee2e2', label: 'Small Businesses & Marketing Teams'    }
    ]
  }
};

/* ─── Page loaders ─── */
function loadServicePage(key) {
  const data = SERVICES[key];
  if (!data) return;

  const prefix = 'svc-' + {
    'financial-advisory':  'fa',
    'research-consulting': 'rc',
    'access-management':   'am',
    'business-development':'bd',
    'vehicle-hire':        'vh'
  }[key];

  /* Highlights */
  const hlEl = $(prefix + '-highlights');
  if (hlEl) {
    hlEl.innerHTML = data.highlights.map(h => `
      <div class="svc-highlight-card">
        <div class="svc-hl-icon" style="background:${h.bg};color:${h.color}">
          <i class="fas ${h.icon}"></i>
        </div>
        <div class="svc-hl-value">${h.value}</div>
        <div class="svc-hl-label">${h.label}</div>
      </div>`).join('');
  }

  /* Features */
  const ftEl = $(prefix + '-features');
  if (ftEl) {
    ftEl.innerHTML = data.features.map(f => `
      <li>
        <i class="fas ${f.icon}" style="color:${f.color};flex-shrink:0"></i>
        <span>${f.text}</span>
      </li>`).join('');
  }

  /* Audience */
  const auEl = $(prefix + '-audience');
  if (auEl) {
    auEl.innerHTML = data.audience.map(a => `
      <div class="svc-audience-chip">
        <div class="chip-icon" style="background:${a.bg};color:${a.color}">
          <i class="fas ${a.icon}"></i>
        </div>
        <span>${a.label}</span>
      </div>`).join('');
  }

  /* Mark active nav button */
  document.querySelectorAll('.svc-nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.service === key);
  });
}

/* ─── Service enquiry modal ─── */
function openServiceEnquiry(serviceName) {
  $('se-service-name').value = serviceName;
  $('service-enquiry-desc').textContent =
    'Enquiring about: ' + serviceName + '. Fill in your details and our team will respond within 24 hours.';
  $('service-enquiry-form').reset();
  $('se-service-name').value = serviceName;
  openModal('service-enquiry-modal');
}

function submitServiceEnquiry(e) {
  e.preventDefault();
  const name    = $('se-name').value.trim();
  const service = $('se-service-name').value;
  closeModal('service-enquiry-modal');
  showToast('Thank you ' + name + '! Your enquiry for "' + service + '" has been received.', 'success');
}

/* ─── Clear active state when leaving service pages ─── */
function clearServiceNavActive() {
  document.querySelectorAll('.svc-nav-btn').forEach(btn => btn.classList.remove('active'));
}
