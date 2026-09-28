const fs = require('fs');
let file = 'src/app/modules/admin/account/settings/plugins/plugins.component.ts';
let content = fs.readFileSync(file, 'utf8');

const target1 = `                        } else {
                            this.colabStatus = {
                                status: 'running',
                                is_connected: true,
                                colab_url: this.colabConfigUrl,
                                gpu: 'Colab GPU (Cấu hình Tác vụ)'
                            };
                        }`;

const replacement1 = `                        } else {
                            this.colabStatus = {
                                status: 'offline',
                                is_connected: false,
                                colab_url: this.colabConfigUrl,
                                gpu: 'Colab GPU (Cấu hình Tác vụ)'
                            };
                        }`;

const target2 = `                    } catch(err) {
                        this.colabStatus = {
                            status: 'configured',
                            is_connected: true,
                            colab_url: this.colabConfigUrl,
                            gpu: 'Colab GPU (Cấu hình Tác vụ)'
                        };
                    }`;

const replacement2 = `                    } catch(err) {
                        this.colabStatus = {
                            status: 'offline',
                            is_connected: false,
                            colab_url: this.colabConfigUrl,
                            gpu: 'Colab GPU (Cấu hình Tác vụ)'
                        };
                    }`;

content = content.replace(target1, replacement1);
content = content.replace(target2, replacement2);
fs.writeFileSync(file, content, 'utf8');
