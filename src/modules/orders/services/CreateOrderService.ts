import { inject, injectable } from 'tsyringe';

import AppError from '@shared/errors/AppError';

import IProductsRepository from '@modules/products/repositories/IProductsRepository';
import ICustomersRepository from '@modules/customers/repositories/ICustomersRepository';
import Order from '../infra/typeorm/entities/Order';
import IOrdersRepository from '../repositories/IOrdersRepository';

interface IProduct {
  id: string;
  quantity: number;
}

interface IRequest {
  customer_id: string;
  products: IProduct[];
}

@injectable()
class CreateOrderService {
  constructor(
    @inject('OrdersRepository')
    private ordersRepository: IOrdersRepository,

    @inject('ProductsRepository')
    private productsRepository: IProductsRepository,

    @inject('CustomersRepository')
    private customersRepository: ICustomersRepository,
  ) {}

  public async execute({ customer_id, products }: IRequest): Promise<Order> {
    const customer = await this.customersRepository.findById(customer_id);

    if (!customer) {
      throw new AppError('Customer not found');
    }

    const productsId = products.map(product => ({ id: product.id }));

    const productsStocked = await this.productsRepository.findAllById(
      productsId,
    );

    if (productsStocked.length < products.length) {
      throw new AppError('Some product is not available.');
    }

    const productsToOrder = products.map(productToOrder => {
      const productStocked = productsStocked.find(
        item => item.id === productToOrder.id,
      );

      if (!productStocked) {
        throw new AppError('Product is not available.');
      }

      if (productToOrder.quantity > productStocked?.quantity) {
        throw new AppError(
          `${productStocked?.name} has insufficient quantity.`,
        );
      }

      return {
        product_id: productStocked.id,
        price: productStocked.price,
        quantity: productToOrder.quantity,
      };
    });

    const order = await this.ordersRepository.create({
      customer,
      products: productsToOrder,
    });

    const productsNewQuantity = products.map(product => {
      const findProduct = productsStocked.find(item => item.id === product.id);
      return {
        id: product.id,
        quantity: findProduct ? findProduct.quantity - product.quantity : 0,
      };
    });

    await this.productsRepository.updateQuantity(productsNewQuantity);

    delete order.customer_id;

    return { ...order, customer };
  }
}

export default CreateOrderService;
